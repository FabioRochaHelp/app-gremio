import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { categoriaSchema, configSchema, type CategoriaInput, type ConfigInput } from '@gremio/shared';
import { Perfis } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ConfiguracaoService } from './configuracao.service';

@Controller()
export class ConfiguracaoController {
  constructor(private readonly configuracao: ConfiguracaoService) {}

  @Get('config')
  obter() {
    return this.configuracao.obter();
  }

  @Perfis('TESOUREIRO')
  @Put('config')
  salvar(@Body(new ZodPipe(configSchema)) dados: ConfigInput) {
    return this.configuracao.salvar(dados);
  }

  @Get('categorias')
  listarCategorias() {
    return this.configuracao.listarCategorias();
  }

  @Perfis('TESOUREIRO')
  @Post('categorias')
  criarCategoria(@Body(new ZodPipe(categoriaSchema)) dados: CategoriaInput) {
    return this.configuracao.criarCategoria(dados);
  }

  @Perfis('TESOUREIRO')
  @Patch('categorias/:id')
  atualizarCategoria(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(categoriaSchema.partial())) dados: Partial<CategoriaInput>,
  ) {
    return this.configuracao.atualizarCategoria(id, dados);
  }
}
