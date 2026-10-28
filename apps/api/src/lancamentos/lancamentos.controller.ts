import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  competenciaQuerySchema,
  estornoSchema,
  lancamentoSchema,
  type EstornoInput,
  type LancamentoInput,
} from '@gremio/shared';
import { Perfis, Usuario, type UsuarioAutenticado } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { LancamentosService, TAMANHO_MAXIMO_NOTA } from './lancamentos.service';

@Controller()
export class LancamentosController {
  constructor(private readonly lancamentos: LancamentosService) {}

  @Get('painel')
  painel(@Usuario() usuario: UsuarioAutenticado) {
    return this.lancamentos.painel(usuario);
  }

  @Get('lancamentos')
  listar(
    @Query(new ZodPipe(competenciaQuerySchema)) { competencia }: { competencia: string },
    @Usuario() usuario: UsuarioAutenticado,
  ) {
    return this.lancamentos.listar(competencia, usuario);
  }

  @Get('lancamentos/:id')
  detalhe(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: UsuarioAutenticado) {
    return this.lancamentos.detalhe(id, usuario);
  }

  @Get('lancamentos/:id/comprovante')
  comprovante(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: UsuarioAutenticado) {
    return this.lancamentos.urlComprovante(id, usuario);
  }

  @Perfis('TESOUREIRO')
  @Post('lancamentos')
  @UseInterceptors(FileInterceptor('comprovante', { limits: { fileSize: TAMANHO_MAXIMO_NOTA, files: 1 } }))
  criar(
    @Body(new ZodPipe(lancamentoSchema)) dados: LancamentoInput,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Usuario() usuario: UsuarioAutenticado,
  ) {
    return this.lancamentos.criar(dados, arquivo, usuario);
  }

  @Perfis('TESOUREIRO')
  @Post('lancamentos/:id/estorno')
  estornar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(estornoSchema)) dados: EstornoInput,
    @Usuario() usuario: UsuarioAutenticado,
  ) {
    return this.lancamentos.estornar(id, dados, usuario);
  }
}
