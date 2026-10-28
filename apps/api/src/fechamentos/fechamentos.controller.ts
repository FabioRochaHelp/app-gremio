import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { competenciaQuerySchema, fecharMesSchema, type FecharMesInput } from '@gremio/shared';
import { Perfis, Usuario, type UsuarioAutenticado } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { FechamentosService, TAMANHO_MAXIMO_EXTRATO } from './fechamentos.service';

const competenciaPipe = new ZodPipe(competenciaQuerySchema);

@Controller('fechamentos')
export class FechamentosController {
  constructor(private readonly fechamentos: FechamentosService) {}

  @Get()
  listar() {
    return this.fechamentos.listar();
  }

  @Perfis('TESOUREIRO')
  @Get('previa')
  previa(@Query(competenciaPipe) { competencia }: { competencia: string }) {
    return this.fechamentos.previa(competencia);
  }

  @Perfis('TESOUREIRO')
  @Post()
  @UseInterceptors(FileInterceptor('extrato', { limits: { fileSize: TAMANHO_MAXIMO_EXTRATO, files: 1 } }))
  fechar(
    @Body(new ZodPipe(fecharMesSchema)) dados: FecharMesInput,
    @UploadedFile() extrato: Express.Multer.File | undefined,
    @Usuario() usuario: UsuarioAutenticado,
  ) {
    return this.fechamentos.fechar(dados, extrato, usuario);
  }

  @Get(':competencia/pdf')
  pdf(@Param(competenciaPipe) { competencia }: { competencia: string }) {
    return this.fechamentos.urlPdf(competencia);
  }

  @Perfis('TESOUREIRO')
  @Get(':competencia/extrato')
  extrato(@Param(competenciaPipe) { competencia }: { competencia: string }) {
    return this.fechamentos.urlExtrato(competencia);
  }
}
