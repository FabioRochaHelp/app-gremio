import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  competenciaDe,
  type EstornoInput,
  type LancamentoDto,
  type LancamentoInput,
  type PainelDto,
  type TotaisMes,
} from '@gremio/shared';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { UsuarioAutenticado } from '../auth/decorators';
import { competenciaTravada } from '../fechamentos/trava';
import { DadosAvisarLancamento, FILA_NOTIFICACOES, JOB_AVISAR_LANCAMENTO } from '../filas/filas';
import { MensalidadesService } from '../mensalidades/mensalidades.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { efeito } from './efeito';

export const TAMANHO_MAXIMO_NOTA = 10 * 1024 * 1024;
const MESES_NO_PAINEL = 6;

const INCLUIR = {
  categoria: true,
  autor: true,
  // Baixa vigente (para reabrir a mensalidade no estorno) e origem permanente (para a privacidade).
  mensalidade: { select: { id: true } },
  origemMensalidade: { select: { associadoId: true } },
  estornoDe: true,
  estornadoPor: true,
} satisfies Prisma.LancamentoInclude;

type LancamentoCompleto = Prisma.LancamentoGetPayload<{ include: typeof INCLUIR }>;

// Formatos aceitos para a foto da nota ou recibo, reconhecidos pelos primeiros bytes.
function tipoDoArquivo(conteudo: Buffer): { extensao: string; contentType: string } | null {
  const inicio = conteudo.subarray(0, 12);
  if (inicio.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { extensao: 'jpg', contentType: 'image/jpeg' };
  if (inicio.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { extensao: 'png', contentType: 'image/png' };
  if (inicio.toString('latin1', 0, 4) === 'RIFF' && inicio.toString('latin1', 8, 12) === 'WEBP') {
    return { extensao: 'webp', contentType: 'image/webp' };
  }
  if (inicio.toString('latin1', 4, 8) === 'ftyp' && /hei[cx]|mif1/.test(inicio.toString('latin1', 8, 12))) {
    return { extensao: 'heic', contentType: 'image/heic' };
  }
  if (inicio.toString('latin1', 0, 5) === '%PDF-') return { extensao: 'pdf', contentType: 'application/pdf' };
  return null;
}

/** Data escolhida no formulário (dia, sem hora) vira meio-dia em São Paulo; o dia de hoje usa a hora atual. */
function dataDoLancamento(dia: string | undefined, agora: Date): Date {
  if (!dia) return agora;
  const hojeSp = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dia === hojeSp) return agora;
  return new Date(`${dia}T15:00:00.000Z`);
}

@Injectable()
export class LancamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mensalidades: MensalidadesService,
    @InjectQueue(FILA_NOTIFICACOES) private readonly avisos: Queue<DadosAvisarLancamento>,
  ) {}

  async criar(
    dados: LancamentoInput,
    arquivo: Express.Multer.File | undefined,
    usuario: UsuarioAutenticado,
  ): Promise<LancamentoDto> {
    // Regra central da transparência: nenhum lançamento sem comprovante.
    const tipoArquivo = arquivo && tipoDoArquivo(arquivo.buffer);
    if (!arquivo || !tipoArquivo) {
      throw new BadRequestException('Anexe a foto da nota ou do recibo (JPG, PNG, WEBP, HEIC ou PDF)');
    }

    const agora = new Date();
    const data = dataDoLancamento(dados.data, agora);
    if (data.getTime() > agora.getTime() + 5 * 60 * 1000) {
      throw new BadRequestException('A data não pode estar no futuro');
    }
    const competencia = competenciaDe(data);
    await this.garantirMesAberto(competencia);

    if (dados.categoriaId) {
      const categoria = await this.prisma.db.categoria.findUnique({ where: { id: dados.categoriaId } });
      if (!categoria?.ativa) throw new BadRequestException('Categoria inválida');
    }

    const chave = `comprovantes/lancamentos/${competencia}/${randomUUID()}.${tipoArquivo.extensao}`;
    await this.storage.enviar(chave, arquivo.buffer, tipoArquivo.contentType);

    const lancamento = await this.prisma.db.lancamento.create({
      data: {
        tipo: dados.tipo,
        categoriaId: dados.tipo === 'SAIDA' ? dados.categoriaId : null,
        valor: dados.valor,
        descricao: dados.descricao,
        comprovanteKey: chave,
        autorId: usuario.id,
        data,
        competencia,
      },
      include: INCLUIR,
    });
    await this.avisos.add(JOB_AVISAR_LANCAMENTO, { lancamentoId: lancamento.id });
    return paraDto(lancamento, usuario);
  }

  /** Correção sem apagar nada: cria um lançamento que desfaz o original, com o motivo. */
  async estornar(id: string, { motivo }: EstornoInput, usuario: UsuarioAutenticado): Promise<LancamentoDto> {
    const original = await this.prisma.db.lancamento.findUnique({ where: { id }, include: INCLUIR });
    if (!original) throw new NotFoundException();
    if (original.tipo === 'ESTORNO') throw new ConflictException('Um estorno não pode ser estornado');
    if (original.estornadoPor) throw new ConflictException('Este lançamento já foi estornado');

    const agora = new Date();
    let estorno: LancamentoCompleto;
    try {
      estorno = await this.prisma.db.$transaction(async (tx) => {
        const criado = await tx.lancamento.create({
          data: {
            tipo: 'ESTORNO',
            categoriaId: original.categoriaId,
            valor: original.valor,
            descricao: `Estorno: ${original.descricao}`,
            autorId: usuario.id,
            data: agora,
            competencia: competenciaDe(agora),
            estornoDeId: original.id,
            motivoEstorno: motivo,
            mensalidadeId: original.mensalidadeId,
          },
          include: INCLUIR,
        });
        // Estornar a baixa de uma mensalidade reabre a mensalidade. O E2E continua gravado
        // nela, então o mesmo comprovante não passa de novo na leitura automática.
        if (original.mensalidade) {
          await tx.mensalidade.update({
            where: { lancamentoId: original.id },
            data: {
              status: 'ABERTA',
              tipoBaixa: null,
              lancamentoId: null,
              motivoRecusa: `Pagamento estornado: ${motivo}`,
            },
          });
        }
        return criado;
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Este lançamento já foi estornado');
      }
      throw erro;
    }

    if (original.origemMensalidade) {
      await this.mensalidades.atualizarInadimplencia(original.origemMensalidade.associadoId);
    }
    await this.avisos.add(JOB_AVISAR_LANCAMENTO, { lancamentoId: estorno.id });
    return paraDto(estorno, usuario);
  }

  async listar(competencia: string, usuario: UsuarioAutenticado): Promise<LancamentoDto[]> {
    const lancamentos = await this.prisma.db.lancamento.findMany({
      where: { competencia },
      include: INCLUIR,
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
    });
    return lancamentos.map((l) => paraDto(l, usuario));
  }

  async detalhe(id: string, usuario: UsuarioAutenticado): Promise<LancamentoDto> {
    const lancamento = await this.prisma.db.lancamento.findUnique({ where: { id }, include: INCLUIR });
    if (!lancamento) throw new NotFoundException();
    return paraDto(lancamento, usuario);
  }

  async urlComprovante(id: string, usuario: UsuarioAutenticado): Promise<{ url: string }> {
    const lancamento = await this.prisma.db.lancamento.findUnique({ where: { id }, include: INCLUIR });
    if (!lancamento || !podeVerComprovante(lancamento, usuario)) throw new NotFoundException();
    return { url: await this.storage.urlTemporaria(lancamento.comprovanteKey!) };
  }

  async painel(usuario: UsuarioAutenticado): Promise<PainelDto> {
    const todos = await this.prisma.db.lancamento.findMany({
      select: {
        tipo: true,
        valor: true,
        competencia: true,
        categoria: { select: { nome: true } },
        estornoDe: { select: { tipo: true } },
      },
    });

    const atual = competenciaDe(new Date());
    const meses: TotaisMes[] = [];
    for (let i = MESES_NO_PAINEL - 1; i >= 0; i--) {
      const [ano, mes] = atual.split('-').map(Number);
      const d = new Date(Date.UTC(ano, mes - 1 - i, 15));
      meses.push({ competencia: d.toISOString().slice(0, 7), entradas: 0, saidas: 0 });
    }
    const porMes = new Map(meses.map((m) => [m.competencia, m]));
    const porCategoria = new Map<string, number>();
    let saldo = 0;

    for (const l of todos) {
      const delta = efeito(l.tipo, l.valor, l.estornoDe?.tipo);
      saldo += delta;
      // Para os totais, o estorno abate do tipo original (entrada estornada reduz as entradas).
      const tipoBase = l.tipo === 'ESTORNO' ? l.estornoDe!.tipo : l.tipo;
      const sinal = l.tipo === 'ESTORNO' ? -1 : 1;
      const totais = porMes.get(l.competencia);
      if (totais) {
        if (tipoBase === 'ENTRADA') totais.entradas += sinal * l.valor;
        else totais.saidas += sinal * l.valor;
      }
      if (l.competencia === atual && tipoBase === 'SAIDA' && l.categoria) {
        porCategoria.set(l.categoria.nome, (porCategoria.get(l.categoria.nome) ?? 0) + sinal * l.valor);
      }
    }

    const ultimos = await this.prisma.db.lancamento.findMany({
      include: INCLUIR,
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      take: 5,
    });

    return {
      saldo,
      mesAtual: porMes.get(atual)!,
      meses,
      categorias: [...porCategoria]
        .map(([nome, total]) => ({ nome, total }))
        .filter((c) => c.total !== 0)
        .sort((a, b) => b.total - a.total),
      ultimos: ultimos.map((l) => paraDto(l, usuario)),
    };
  }

  private async garantirMesAberto(competencia: string) {
    if (await competenciaTravada(this.prisma.db, competencia)) {
      throw new ConflictException('Este mês já foi fechado; lance com a data de hoje');
    }
  }
}

// Comprovante e pagador de mensalidade mostram quem pagou: só o tesoureiro e o próprio associado veem.
function podeVerComprovante(l: LancamentoCompleto, usuario: UsuarioAutenticado): boolean {
  if (!l.comprovanteKey) return false;
  const mensalidade = l.origemMensalidade;
  return !mensalidade || usuario.perfil === 'TESOUREIRO' || mensalidade.associadoId === usuario.id;
}

function paraDto(l: LancamentoCompleto, usuario: UsuarioAutenticado): LancamentoDto {
  const mensalidade = l.origemMensalidade;
  const autorRestrito = mensalidade && usuario.perfil !== 'TESOUREIRO';
  return {
    id: l.id,
    tipo: l.tipo,
    valor: l.valor,
    efeito: efeito(l.tipo, l.valor, l.estornoDe?.tipo),
    descricao: l.descricao,
    categoria: l.categoria ? { id: l.categoria.id, nome: l.categoria.nome } : null,
    data: l.data.toISOString(),
    competencia: l.competencia,
    criadoEm: l.criadoEm.toISOString(),
    autor: autorRestrito ? null : { nome: l.autor.nome, posto: l.autor.posto },
    deMensalidade: mensalidade !== null,
    comprovanteVisivel: podeVerComprovante(l, usuario),
    motivoEstorno: l.motivoEstorno,
    estornoDe: l.estornoDe ? { id: l.estornoDe.id, tipo: l.estornoDe.tipo, descricao: l.estornoDe.descricao } : null,
    estornadoPor: l.estornadoPor
      ? { id: l.estornadoPor.id, motivo: l.estornadoPor.motivoEstorno, data: l.estornadoPor.data.toISOString() }
      : null,
  };
}
