import { Module } from '@nestjs/common';
import { ConfiguracaoModule } from '../configuracao/configuracao.module';
import { PixService } from '../pix/pix.service';
import { MensalidadesController } from './mensalidades.controller';
import { MensalidadesService } from './mensalidades.service';

@Module({
  imports: [ConfiguracaoModule],
  controllers: [MensalidadesController],
  providers: [MensalidadesService, PixService],
  exports: [MensalidadesService],
})
export class MensalidadesModule {}
