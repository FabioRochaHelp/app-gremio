import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { inscricaoPushSchema, type InscricaoPushInput } from '@gremio/shared';
import { z } from 'zod';
import { Usuario, type UsuarioAutenticado } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { NotificacoesService } from './notificacoes.service';

const cancelamentoSchema = z.object({ endpoint: z.string().url() });

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get('chave')
  chave() {
    return this.notificacoes.obterChavePublica();
  }

  @Post('inscricao')
  @HttpCode(204)
  inscrever(
    @Usuario() usuario: UsuarioAutenticado,
    @Body(new ZodPipe(inscricaoPushSchema)) dados: InscricaoPushInput,
  ) {
    return this.notificacoes.inscrever(usuario.id, dados);
  }

  @Delete('inscricao')
  @HttpCode(204)
  cancelar(
    @Usuario() usuario: UsuarioAutenticado,
    @Body(new ZodPipe(cancelamentoSchema)) { endpoint }: z.infer<typeof cancelamentoSchema>,
  ) {
    return this.notificacoes.cancelar(usuario.id, endpoint);
  }
}
