import { Injectable, NotFoundException } from '@nestjs/common';
import type { CategoriaDto, CategoriaInput, ConfigDto, ConfigInput } from '@gremio/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfiguracaoService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(): Promise<ConfigDto> {
    const config = await this.prisma.db.config.findUnique({ where: { id: 1 } });
    if (!config) throw new NotFoundException('Configuração ainda não definida (rode o seed)');
    const { id: _id, ...dados } = config;
    return dados;
  }

  async salvar(dados: ConfigInput): Promise<ConfigDto> {
    const { id: _id, ...config } = await this.prisma.db.config.upsert({
      where: { id: 1 },
      create: { id: 1, ...dados },
      update: dados,
    });
    return config;
  }

  listarCategorias(): Promise<CategoriaDto[]> {
    return this.prisma.db.categoria.findMany({ orderBy: { nome: 'asc' } });
  }

  criarCategoria(dados: CategoriaInput): Promise<CategoriaDto> {
    return this.prisma.db.categoria.create({ data: dados });
  }

  // Categorias não são apagadas (lançamentos antigos apontam para elas), só desativadas.
  atualizarCategoria(id: string, dados: Partial<CategoriaInput>): Promise<CategoriaDto> {
    return this.prisma.db.categoria.update({ where: { id }, data: dados });
  }
}
