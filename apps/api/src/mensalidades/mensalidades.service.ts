import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  competenciaDe,
  rotuloCompetencia,
  type CobrancaPixDto,
  type DadosExtraidos,
  type MensalidadeDto,
  type MensalidadeTesourariaDto,
} from '@gremio/shared';
import { Prisma, type Associado, type Mensalidade, type TipoBaixa } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { UsuarioAutenticado } from '../auth/decorators';
import { pareceUmPdf } from '../comprovantes/pdf';
import { ConfiguracaoService } from '../configuracao/configuracao.service';
import { competenciaTravada } from '../fechamentos/trava';
import { DadosLerComprovante, FILA_COMPROVANTES, JOB_LER_COMPROVANTE } from '../filas/filas';
import { PixService } from '../pix/pix.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const TAMANHO_MAXIMO_COMPROVANTE = 5 * 1024 * 1024;

interface Baixa {
  tipoBaixa: TipoBaixa;
  e2eId: string | null;
  dataPagamento: Date | null;
  autorId: string;
}

@Injectable()
export class MensalidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracao: ConfiguracaoService,
    private readonly pix: PixService,
    @InjectQueue(FILA_COMPROVANTES) private readonly fila: Queue<DadosLerComprovante>,
  ) {}

  // ---- Associado -------------------------------------------------------------

  async minhas(associadoId: string): Promise<MensalidadeDto[]> {
    const mensalidades = await this.prisma.db.mensalidade.findMany({
      where: { associadoId },
      orderBy: { competencia: 'desc' },
    });
    return mensalidades.map(paraDto);
  }

  async cobranca(id: string, usuario: UsuarioAutenticado): Promise<CobrancaPixDto> {
    const mensalidade = await this.daPropria(id, usuario);
    if (mensalidade.status !== 'ABERTA') {
      throw new ConflictException('Esta mensalidade não está em aberto');
    }
    return this.pix.cobranca(mensalidade);
  }

  async enviarComprovante(
    id: string,
    usuario: UsuarioAutenticado,
    arquivo: Express.Multer.File | undefined,
  ): Promise<MensalidadeDto> {
    const mensalidade = await this.daPropria(id, usuario);
    if (mensalidade.status !== 'ABERTA') {
      throw new ConflictException('Esta mensalidade não está aguardando comprovante');
    }
    if (!arquivo || !pareceUmPdf(arquivo.buffer)) {
      throw new BadRequestException('Envie o comprovante do Pix em PDF');
    }

    const chave = `comprovantes/mensalidades/${mensalidade.competencia}/${mensalidade.id}-${randomUUID()}.pdf`;
    await this.storage.enviar(chave, arquivo.buffer, 'application/pdf');
    // O filtro por status evita corrida com outro envio simultâneo.
    const atualizada = await this.prisma.db.mensalidade.update({
      where: { id, status: 'ABERTA' },
      data: {
        status: 'EM_ANALISE',
        comprovanteKey: chave,
        motivoRecusa: null,
        dadosExtraidos: Prisma.DbNull,
      },
    });
    await this.fila.add(JOB_LER_COMPROVANTE, { mensalidadeId: id });
    return paraDto(atualizada);
  }

  /** Link do comprovante: o próprio associado ou o tesoureiro. */
  async urlComprovante(id: string, usuario: UsuarioAutenticado): Promise<{ url: string }> {
    const mensalidade = await this.prisma.db.mensalidade.findUnique({ where: { id } });
    const permitido = mensalidade && (mensalidade.associadoId === usuario.id || usuario.perfil === 'TESOUREIRO');
    if (!permitido || !mensalidade.comprovanteKey) throw new NotFoundException();
    return { url: await this.storage.urlTemporaria(mensalidade.comprovanteKey) };
  }

  // ---- Tesoureiro ------------------------------------------------------------

  async listar(competencia: string): Promise<MensalidadeTesourariaDto[]> {
    const mensalidades = await this.prisma.db.mensalidade.findMany({
      where: { competencia },
      include: { associado: true },
      orderBy: { associado: { nome: 'asc' } },
    });
    return mensalidades.map(paraDtoTesouraria);
  }

  async emRevisao(): Promise<MensalidadeTesourariaDto[]> {
    const mensalidades = await this.prisma.db.mensalidade.findMany({
      where: { status: 'EM_REVISAO' },
      include: { associado: true },
      orderBy: { atualizadoEm: 'asc' },
    });
    return mensalidades.map(paraDtoTesouraria);
  }

  /** Cria a mensalidade da competência para cada associado. Pode ser chamada de novo sem duplicar. */
  async gerar(competencia: string): Promise<{ criadas: number }> {
    const config = await this.configuracao.obter();
    const associados = await this.prisma.db.associado.findMany({ select: { id: true, situacao: true } });
    const { count } = await this.prisma.db.mensalidade.createMany({
      data: associados.map((a) => ({
        associadoId: a.id,
        competencia,
        valor: config.valorMensalidade,
        status: a.situacao === 'ISENTO' ? ('ISENTA' as const) : ('ABERTA' as const),
      })),
      skipDuplicates: true,
    });
    return { criadas: count };
  }

  async aprovar(id: string, e2eInformado: string | undefined, tesoureiroId: string): Promise<MensalidadeDto> {
    const mensalidade = await this.prisma.db.mensalidade.findUniqueOrThrow({ where: { id } });
    if (mensalidade.status !== 'EM_REVISAO') {
      throw new ConflictException('Só é possível aprovar comprovantes em revisão');
    }
    const extraidos = mensalidade.dadosExtraidos as DadosExtraidos | null;
    try {
      await this.registrarBaixa(id, {
        tipoBaixa: 'MANUAL',
        e2eId: e2eInformado ?? extraidos?.e2eId ?? null,
        dataPagamento: extraidos?.data ? new Date(extraidos.data) : null,
        autorId: tesoureiroId,
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Este ID de transação já foi usado em outra mensalidade');
      }
      throw erro;
    }
    return paraDto(await this.prisma.db.mensalidade.findUniqueOrThrow({ where: { id } }));
  }

  /** Devolve ao associado para enviar outro comprovante. */
  async recusar(id: string, motivo: string): Promise<MensalidadeDto> {
    const mensalidade = await this.prisma.db.mensalidade.findUniqueOrThrow({ where: { id } });
    if (mensalidade.status !== 'EM_REVISAO') {
      throw new ConflictException('Só é possível recusar comprovantes em revisão');
    }
    const atualizada = await this.prisma.db.mensalidade.update({
      where: { id, status: 'EM_REVISAO' },
      data: { status: 'ABERTA', motivoRecusa: motivo },
    });
    return paraDto(atualizada);
  }

  // ---- Usado pela leitura automática e pelos agendamentos --------------------

  async enviarParaRevisao(id: string, motivo: string, dados: DadosExtraidos | null): Promise<void> {
    await this.prisma.db.mensalidade.update({
      where: { id, status: 'EM_ANALISE' },
      data: {
        status: 'EM_REVISAO',
        motivoRecusa: motivo,
        dadosExtraidos: dados ? (dados as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  }

  /** Dá a baixa: cria a entrada no caixa e marca a mensalidade como paga, na mesma transação. */
  async registrarBaixa(id: string, baixa: Baixa): Promise<void> {
    const associadoId = await this.prisma.db.$transaction(async (tx) => {
      const mensalidade = await tx.mensalidade.findUniqueOrThrow({ where: { id } });
      if (mensalidade.status === 'PAGA' || mensalidade.status === 'ISENTA') {
        throw new ConflictException('Esta mensalidade já foi quitada');
      }

      // Se o mês do pagamento já foi fechado, a entrada vai para o mês corrente.
      let data = baixa.dataPagamento ?? new Date();
      if (await competenciaTravada(tx, competenciaDe(data))) data = new Date();

      // Sem o nome do associado: o extrato é público para todos, e quem pagou ou não é
      // informação restrita ao tesoureiro (LGPD).
      const lancamento = await tx.lancamento.create({
        data: {
          tipo: 'ENTRADA',
          valor: mensalidade.valor,
          descricao: `Mensalidade de ${rotuloCompetencia(mensalidade.competencia)}`,
          comprovanteKey: mensalidade.comprovanteKey,
          autorId: baixa.autorId,
          data,
          competencia: competenciaDe(data),
          mensalidadeId: id,
        },
      });

      await tx.mensalidade.update({
        where: { id, status: mensalidade.status },
        data: {
          status: 'PAGA',
          tipoBaixa: baixa.tipoBaixa,
          e2eId: baixa.e2eId,
          lancamentoId: lancamento.id,
          motivoRecusa: null,
        },
      });
      return mensalidade.associadoId;
    });
    await this.atualizarInadimplencia(associadoId);
  }

  /**
   * Situação derivada das mensalidades: quem tem mensalidade de mês anterior em aberto fica
   * inadimplente; quem quitou volta a ativo. Isentos não mudam.
   */
  async atualizarInadimplencia(associadoId?: string): Promise<{ marcados: number; regularizados: number }> {
    const atual = competenciaDe(new Date());
    const pendentes = await this.prisma.db.mensalidade.findMany({
      where: { status: 'ABERTA', competencia: { lt: atual }, ...(associadoId && { associadoId }) },
      select: { associadoId: true },
      distinct: ['associadoId'],
    });
    const devedores = pendentes.map((p) => p.associadoId);
    const escopo: Prisma.AssociadoWhereInput = associadoId ? { id: associadoId } : {};

    const marcados = await this.prisma.db.associado.updateMany({
      where: { AND: [escopo, { id: { in: devedores } }], situacao: 'ATIVO' },
      data: { situacao: 'INADIMPLENTE' },
    });
    const regularizados = await this.prisma.db.associado.updateMany({
      where: { AND: [escopo, { id: { notIn: devedores } }], situacao: 'INADIMPLENTE' },
      data: { situacao: 'ATIVO' },
    });
    return { marcados: marcados.count, regularizados: regularizados.count };
  }

  private async daPropria(id: string, usuario: UsuarioAutenticado): Promise<Mensalidade> {
    const mensalidade = await this.prisma.db.mensalidade.findUnique({ where: { id } });
    if (!mensalidade || mensalidade.associadoId !== usuario.id) throw new NotFoundException();
    return mensalidade;
  }
}

function paraDto(m: Mensalidade): MensalidadeDto {
  return {
    id: m.id,
    competencia: m.competencia,
    valor: m.valor,
    status: m.status,
    tipoBaixa: m.tipoBaixa,
    motivoRecusa: m.motivoRecusa,
    temComprovante: m.comprovanteKey !== null,
    atualizadoEm: m.atualizadoEm.toISOString(),
  };
}

function paraDtoTesouraria(m: Mensalidade & { associado: Associado }): MensalidadeTesourariaDto {
  return {
    ...paraDto(m),
    associado: { id: m.associado.id, nome: m.associado.nome, re: m.associado.re, posto: m.associado.posto },
    dadosExtraidos: m.dadosExtraidos as DadosExtraidos | null,
  };
}
