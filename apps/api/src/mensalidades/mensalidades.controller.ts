import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  aprovarMensalidadeSchema,
  gerarMensalidadesSchema,
  recusarMensalidadeSchema,
  type AprovarMensalidadeInput,
  type GerarMensalidadesInput,
  type RecusarMensalidadeInput,
} from '@gremio/shared';
import { Perfis, Usuario, type UsuarioAutenticado } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { MensalidadesService, TAMANHO_MAXIMO_COMPROVANTE } from './mensalidades.service';

@Controller('mensalidades')
export class MensalidadesController {
  constructor(private readonly mensalidades: MensalidadesService) {}

  @Get('minhas')
  minhas(@Usuario() usuario: UsuarioAutenticado) {
    return this.mensalidades.minhas(usuario.id);
  }

  @Get(':id/pix')
  pix(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: UsuarioAutenticado) {
    return this.mensalidades.cobranca(id, usuario);
  }

  @Post(':id/comprovante')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO_COMPROVANTE, files: 1 } }))
  enviarComprovante(
    @Param('id', ParseUUIDPipe) id: string,
    @Usuario() usuario: UsuarioAutenticado,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
  ) {
    return this.mensalidades.enviarComprovante(id, usuario, arquivo);
  }

  @Get(':id/comprovante')
  comprovante(@Param('id', ParseUUIDPipe) id: string, @Usuario() usuario: UsuarioAutenticado) {
    return this.mensalidades.urlComprovante(id, usuario);
  }

  @Perfis('TESOUREIRO')
  @Get()
  listar(@Query(new ZodPipe(gerarMensalidadesSchema)) { competencia }: GerarMensalidadesInput) {
    return this.mensalidades.listar(competencia);
  }

  @Perfis('TESOUREIRO')
  @Get('revisao')
  revisao() {
    return this.mensalidades.emRevisao();
  }

  @Perfis('TESOUREIRO')
  @Post('gerar')
  @HttpCode(200)
  gerar(@Body(new ZodPipe(gerarMensalidadesSchema)) { competencia }: GerarMensalidadesInput) {
    return this.mensalidades.gerar(competencia);
  }

  @Perfis('TESOUREIRO')
  @Post(':id/aprovar')
  @HttpCode(200)
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(aprovarMensalidadeSchema)) { e2eId }: AprovarMensalidadeInput,
    @Usuario() usuario: UsuarioAutenticado,
  ) {
    return this.mensalidades.aprovar(id, e2eId, usuario.id);
  }

  @Perfis('TESOUREIRO')
  @Post(':id/recusar')
  @HttpCode(200)
  recusar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(recusarMensalidadeSchema)) { motivo }: RecusarMensalidadeInput,
  ) {
    return this.mensalidades.recusar(id, motivo);
  }
}
