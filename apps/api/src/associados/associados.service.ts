import { ConflictException, Injectable } from '@nestjs/common';
import {
  CODIGO_PRIMEIRO_ACESSO,
  type AssociadoDto,
  type AtualizarAssociadoInput,
  type ConviteDto,
  type CriarAssociadoInput,
} from '@gremio/shared';
import type { Associado } from '@prisma/client';
import { gerarCodigoConvite } from '../auth/convite';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssociadosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<AssociadoDto[]> {
    const associados = await this.prisma.db.associado.findMany({ orderBy: { nome: 'asc' } });
    return associados.map(paraDto);
  }

  async criar(dados: CriarAssociadoInput): Promise<{ associado: AssociadoDto; convite: ConviteDto }> {
    const { codigo, hash, expiraEm } = gerarCodigoConvite(codigoFixo(dados.perfil, null));
    const associado = await this.prisma.db.associado.create({
      data: { ...dados, codigoConvite: hash, conviteExpiraEm: expiraEm },
    });
    return { associado: paraDto(associado), convite: { codigo, expiraEm: expiraEm.toISOString() } };
  }

  async atualizar(id: string, dados: AtualizarAssociadoInput): Promise<AssociadoDto> {
    const atual = await this.prisma.db.associado.findUniqueOrThrow({ where: { id } });
    if (atual.perfil === 'TESOUREIRO' && dados.perfil === 'ASSOCIADO') {
      await this.garantirOutroTesoureiro(id);
    }
    const associado = await this.prisma.db.associado.update({ where: { id }, data: dados });
    return paraDto(associado);
  }

  /**
   * Exclui só quem não tem histórico financeiro: pagamentos, lançamentos e fechamentos
   * são a base da prestação de contas e não podem perder o autor. Mensalidades em aberto
   * (ou isentas) de meses ainda não fechados são removidas junto.
   */
  async excluir(id: string, autorId: string): Promise<void> {
    if (id === autorId) {
      throw new ConflictException('Você não pode excluir o próprio cadastro');
    }
    await this.prisma.db.$transaction(async (tx) => {
      await tx.associado.findUniqueOrThrow({ where: { id } });
      const fechadas = (await tx.fechamentoMensal.findMany({ select: { competencia: true } })).map(
        (f) => f.competencia,
      );
      const [lancamentos, fechamentos, mensalidades] = await Promise.all([
        tx.lancamento.count({ where: { autorId: id } }),
        tx.fechamentoMensal.count({ where: { fechadoPorId: id } }),
        tx.mensalidade.count({
          where: {
            associadoId: id,
            OR: [
              { status: { notIn: ['ABERTA', 'ISENTA'] } },
              { competencia: { in: fechadas } },
              { lancamentos: { some: {} } },
            ],
          },
        }),
      ]);
      if (lancamentos + fechamentos + mensalidades > 0) {
        throw new ConflictException(
          'Este associado já tem histórico financeiro e não pode ser excluído. Marque como isento para parar as cobranças.',
        );
      }
      await tx.mensalidade.deleteMany({ where: { associadoId: id } });
      await tx.associado.delete({ where: { id } });
    });
  }

  /** Novo convite para primeiro acesso ou senha esquecida; a senha atual deixa de valer na ativação. */
  async novoConvite(id: string): Promise<ConviteDto> {
    const atual = await this.prisma.db.associado.findUniqueOrThrow({ where: { id } });
    const { codigo, hash, expiraEm } = gerarCodigoConvite(codigoFixo(atual.perfil, atual.senhaHash));
    await this.prisma.db.associado.update({
      where: { id },
      data: { codigoConvite: hash, conviteExpiraEm: expiraEm },
    });
    return { codigo, expiraEm: expiraEm.toISOString() };
  }

  private async garantirOutroTesoureiro(id: string) {
    const outros = await this.prisma.db.associado.count({
      where: { perfil: 'TESOUREIRO', id: { not: id } },
    });
    if (outros === 0) {
      throw new ConflictException('O grêmio precisa de pelo menos um tesoureiro');
    }
  }
}

/** A palavra fixa vale só no primeiro acesso de associados; senha esquecida e tesoureiros recebem código aleatório. */
function codigoFixo(perfil: Associado['perfil'] | undefined, senhaHash: string | null) {
  return perfil !== 'TESOUREIRO' && senhaHash === null ? CODIGO_PRIMEIRO_ACESSO : undefined;
}

function paraDto(a: Associado): AssociadoDto {
  return {
    id: a.id,
    nome: a.nome,
    re: a.re,
    posto: a.posto,
    unidade: a.unidade,
    celular: a.celular,
    perfil: a.perfil,
    situacao: a.situacao,
    ativado: a.senhaHash !== null,
    criadoEm: a.criadoEm.toISOString(),
  };
}
