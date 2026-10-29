import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  atualizarAssociadoSchema,
  criarAssociadoSchema,
  type AtualizarAssociadoInput,
  type CriarAssociadoInput,
} from '@gremio/shared';
import { Perfis, Usuario, type UsuarioAutenticado } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AssociadosService } from './associados.service';

// Inclui a situação de cada associado (inadimplência), por isso é só do tesoureiro (LGPD).
@Perfis('TESOUREIRO')
@Controller('associados')
export class AssociadosController {
  constructor(private readonly associados: AssociadosService) {}

  @Get()
  listar() {
    return this.associados.listar();
  }

  @Post()
  criar(@Body(new ZodPipe(criarAssociadoSchema)) dados: CriarAssociadoInput) {
    return this.associados.criar(dados);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(atualizarAssociadoSchema)) dados: AtualizarAssociadoInput,
  ) {
    return this.associados.atualizar(id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: UsuarioAutenticado) {
    return this.associados.excluir(id, usuario.id);
  }

  @Post(':id/convite')
  novoConvite(@Param('id', ParseUUIDPipe) id: string) {
    return this.associados.novoConvite(id);
  }
}
