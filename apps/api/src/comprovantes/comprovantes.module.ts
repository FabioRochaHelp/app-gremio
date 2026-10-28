import { Module } from '@nestjs/common';
import { ConfiguracaoModule } from '../configuracao/configuracao.module';
import { MensalidadesModule } from '../mensalidades/mensalidades.module';
import { ComprovantesService } from './comprovantes.service';

@Module({
  imports: [ConfiguracaoModule, MensalidadesModule],
  providers: [ComprovantesService],
  exports: [ComprovantesService],
})
export class ComprovantesModule {}
