import { ConflictException, Injectable } from '@nestjs/common';
import type { AssociadoDto, AtualizarAssociadoInput, ConviteDto, CriarAssociadoInput } from '@gremio/shared';
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
    const { codigo, hash, expiraEm } = gerarCodigoConvite();
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

  /** Novo convite para primeiro acesso ou senha esquecida; a senha atual deixa de valer na ativação. */
  async novoConvite(id: string): Promise<ConviteDto> {
    const { codigo, hash, expiraEm } = gerarCodigoConvite();
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

function paraDto(a: Associado): AssociadoDto {
  return {
    id: a.id,
    nome: a.nome,
    re: a.re,
    posto: a.posto,
    unidade: a.unidade,
    perfil: a.perfil,
    situacao: a.situacao,
    ativado: a.senhaHash !== null,
    criadoEm: a.criadoEm.toISOString(),
  };
}
