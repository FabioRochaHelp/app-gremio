import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  competenciaDe,
  rotuloCompetencia,
  type Divergencia,
  type FecharMesInput,
  type FechamentoDto,
  type PreviaFechamentoDto,
} from '@gremio/shared';
import { Prisma, type Associado, type FechamentoMensal } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { UsuarioAutenticado } from '../auth/decorators';
import { extrairTexto, pareceUmPdf } from '../comprovantes/pdf';
import { ConfiguracaoService } from '../configuracao/configuracao.service';
import { DadosGerarPrestacao, FILA_RELATORIOS, JOB_GERAR_PRESTACAO } from '../filas/filas';
import { efeito } from '../lancamentos/efeito';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { conciliar } from './conciliacao';
import { gerarPdfPrestacao, type Anexo, type LinhaExtrato } from './relatorio';

export const TAMANHO_MAXIMO_EXTRATO = 10 * 1024 * 1024;

const TIPOS_ANEXAVEIS: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  webp: 'image/webp',
  heic: 'image/heic',
};

@Injectable()
export class FechamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracao: ConfiguracaoService,
    private readonly notificacoes: NotificacoesService,
    @InjectQueue(FILA_RELATORIOS) private readonly relatorios: Queue<DadosGerarPrestacao>,
  ) {}

  async listar(): Promise<FechamentoDto[]> {
    const fechamentos = await this.prisma.db.fechamentoMensal.findMany({
      include: { fechadoPor: true },
      orderBy: { competencia: 'desc' },
    });
    return fechamentos.map(paraDto);
  }

  async previa(competencia: string): Promise<PreviaFechamentoDto> {
    const totais = await this.totais(competencia);
    const [mensalidadesPendentes, jaFechado] = await Promise.all([
      this.prisma.db.mensalidade.count({ where: { status: { in: ['EM_ANALISE', 'EM_REVISAO'] } } }),
      this.prisma.db.fechamentoMensal.count({ where: { competencia } }).then((n) => n > 0),
    ]);
    return { competencia, ...totais, mensalidadesPendentes, jaFechado };
  }

  async fechar(
    { competencia, saldoBanco }: FecharMesInput,
    extrato: Express.Multer.File | undefined,
    usuario: UsuarioAutenticado,
  ): Promise<FechamentoDto> {
    if (competencia >= competenciaDe(new Date())) {
      throw new BadRequestException('Só é possível fechar um mês depois que ele termina');
    }
    if (!extrato || !pareceUmPdf(extrato.buffer)) {
      throw new BadRequestException('Anexe o extrato do banco do mês em PDF');
    }
    if (await this.prisma.db.fechamentoMensal.count({ where: { competencia } })) {
      throw new ConflictException('Este mês já foi fechado');
    }

    const { saldoSistema } = await this.totais(competencia);
    const texto = await extrairTexto(extrato.buffer).catch(() => '');
    const baixas = await this.prisma.db.lancamento.findMany({
      where: { competencia, tipo: 'ENTRADA', mensalidadeId: { not: null }, estornadoPor: null },
      include: { origemMensalidade: { select: { e2eId: true } } },
    });
    const divergencias = conciliar(
      texto,
      baixas.map((b) => ({
        lancamentoId: b.id,
        descricao: b.descricao,
        valor: b.valor,
        data: b.data,
        e2eId: b.origemMensalidade?.e2eId ?? null,
      })),
      saldoSistema,
      saldoBanco,
    );

    const chave = `extratos/${competencia}-${randomUUID()}.pdf`;
    await this.storage.enviar(chave, extrato.buffer, 'application/pdf');

    let fechamento: FechamentoMensal & { fechadoPor: Associado };
    try {
      fechamento = await this.prisma.db.fechamentoMensal.create({
        data: {
          competencia,
          saldoSistema,
          saldoBanco,
          extratoKey: chave,
          divergencias: divergencias as unknown as Prisma.InputJsonValue,
          fechadoPorId: usuario.id,
        },
        include: { fechadoPor: true },
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Este mês já foi fechado');
      }
      throw erro;
    }
    await this.relatorios.add(JOB_GERAR_PRESTACAO, { competencia });
    return paraDto(fechamento);
  }

  async urlPdf(competencia: string): Promise<{ url: string }> {
    const fechamento = await this.prisma.db.fechamentoMensal.findUnique({ where: { competencia } });
    if (!fechamento?.pdfKey) throw new NotFoundException('A prestação de contas ainda está sendo gerada');
    return { url: await this.storage.urlTemporaria(fechamento.pdfKey) };
  }

  /** O extrato do banco lista quem fez cada Pix: só o tesoureiro abre. */
  async urlExtrato(competencia: string): Promise<{ url: string }> {
    const fechamento = await this.prisma.db.fechamentoMensal.findUnique({ where: { competencia } });
    if (!fechamento) throw new NotFoundException();
    return { url: await this.storage.urlTemporaria(fechamento.extratoKey) };
  }

  /** Chamado pela fila depois do fechamento. */
  async gerarPrestacao(competencia: string): Promise<void> {
    const fechamento = await this.prisma.db.fechamentoMensal.findUnique({
      where: { competencia },
      include: { fechadoPor: true },
    });
    if (!fechamento || fechamento.pdfKey) return;

    const [config, totais, lancamentos, mensalidades] = await Promise.all([
      this.configuracao.obter(),
      this.totais(competencia),
      this.prisma.db.lancamento.findMany({
        where: { competencia },
        include: { categoria: true, autor: true, estornoDe: true, estornadoPor: true },
        orderBy: [{ data: 'asc' }, { criadoEm: 'asc' }],
      }),
      this.prisma.db.mensalidade.groupBy({ by: ['status'], where: { competencia }, _count: true }),
    ]);

    const anexos: Anexo[] = [];
    const linhas: LinhaExtrato[] = [];
    for (const l of lancamentos) {
      // Comprovantes de mensalidade identificam quem pagou: ficam fora do PDF público.
      const publico = l.comprovanteKey && !l.mensalidadeId;
      let anexo: number | null = null;
      if (publico) {
        anexo = anexos.length + 1;
        const extensao = l.comprovanteKey!.split('.').pop()!;
        anexos.push({
          numero: anexo,
          titulo: l.descricao,
          conteudo: await this.storage.baixar(l.comprovanteKey!),
          contentType: TIPOS_ANEXAVEIS[extensao] ?? 'application/octet-stream',
        });
      }
      linhas.push({
        data: l.data,
        descricao: l.descricao,
        tipo:
          l.tipo === 'SAIDA'
            ? (l.categoria?.nome ?? 'Despesa')
            : l.tipo === 'ESTORNO'
              ? 'Estorno'
              : l.mensalidadeId
                ? 'Mensalidade'
                : 'Entrada',
        autor: l.mensalidadeId ? '—' : `${l.autor.posto} ${l.autor.nome}`,
        efeito: efeito(l.tipo, l.valor, l.estornoDe?.tipo),
        estornado: l.estornadoPor !== null,
        anexo,
      });
    }

    const contagem = Object.fromEntries(mensalidades.map((m) => [m.status, m._count]));
    const pdf = await gerarPdfPrestacao(
      {
        nomeGremio: config.nomeRecebedor,
        competencia,
        ...totais,
        saldoBanco: fechamento.saldoBanco,
        divergencias: fechamento.divergencias as unknown as Divergencia[],
        categorias: this.porCategoria(lancamentos),
        mensalidades: {
          pagas: contagem.PAGA ?? 0,
          isentas: contagem.ISENTA ?? 0,
          emAberto: (contagem.ABERTA ?? 0) + (contagem.EM_ANALISE ?? 0) + (contagem.EM_REVISAO ?? 0),
          total: mensalidades.reduce((soma, m) => soma + m._count, 0),
        },
        linhas,
        fechadoPor: `${fechamento.fechadoPor.posto} ${fechamento.fechadoPor.nome}`,
        fechadoEm: fechamento.fechadoEm,
      },
      anexos,
    );

    const chave = `prestacoes/${competencia}-${randomUUID()}.pdf`;
    await this.storage.enviar(chave, pdf, 'application/pdf');
    await this.prisma.db.fechamentoMensal.update({ where: { competencia }, data: { pdfKey: chave } });

    const divergencias = (fechamento.divergencias as unknown as Divergencia[]).length;
    await this.notificacoes.enviarParaTodos({
      titulo: `Prestação de contas de ${rotuloCompetencia(competencia)}`,
      corpo: divergencias
        ? `Mês fechado com ${divergencias} divergência(s) na conferência com o banco.`
        : 'Mês fechado e conferido com o extrato do banco, sem diferenças.',
      url: '/fechamentos',
    });
  }

  /** Saldo até o fim da competência e o movimento dela. */
  private async totais(competencia: string) {
    const lancamentos = await this.prisma.db.lancamento.findMany({
      where: { competencia: { lte: competencia } },
      select: { tipo: true, valor: true, competencia: true, estornoDe: { select: { tipo: true } } },
    });
    let saldoSistema = 0;
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentos) {
      const delta = efeito(l.tipo, l.valor, l.estornoDe?.tipo);
      saldoSistema += delta;
      if (l.competencia !== competencia) continue;
      const tipoBase = l.tipo === 'ESTORNO' ? l.estornoDe!.tipo : l.tipo;
      const sinal = l.tipo === 'ESTORNO' ? -1 : 1;
      if (tipoBase === 'ENTRADA') entradas += sinal * l.valor;
      else saidas += sinal * l.valor;
    }
    return { saldoInicial: saldoSistema - (entradas - saidas), entradas, saidas, saldoSistema };
  }

  private porCategoria(
    lancamentos: { tipo: string; valor: number; categoria: { nome: string } | null; estornoDe: { tipo: string } | null }[],
  ) {
    const totais = new Map<string, number>();
    for (const l of lancamentos) {
      const tipoBase = l.tipo === 'ESTORNO' ? l.estornoDe?.tipo : l.tipo;
      if (tipoBase !== 'SAIDA' || !l.categoria) continue;
      const sinal = l.tipo === 'ESTORNO' ? -1 : 1;
      totais.set(l.categoria.nome, (totais.get(l.categoria.nome) ?? 0) + sinal * l.valor);
    }
    return [...totais]
      .map(([nome, total]) => ({ nome, total }))
      .filter((c) => c.total !== 0)
      .sort((a, b) => b.total - a.total);
  }
}

function paraDto(f: FechamentoMensal & { fechadoPor: Associado }): FechamentoDto {
  return {
    competencia: f.competencia,
    saldoSistema: f.saldoSistema,
    saldoBanco: f.saldoBanco,
    divergencias: f.divergencias as unknown as Divergencia[],
    pdfPronto: f.pdfKey !== null,
    fechadoPor: { nome: f.fechadoPor.nome, posto: f.fechadoPor.posto },
    fechadoEm: f.fechadoEm.toISOString(),
  };
}
