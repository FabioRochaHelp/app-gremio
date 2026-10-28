import { Module } from '@nestjs/common';
import { MensalidadesModule } from '../mensalidades/mensalidades.module';
import { LancamentosController } from './lancamentos.controller';
import { LancamentosService } from './lancamentos.service';

@Module({
  imports: [MensalidadesModule],
  controllers: [LancamentosController],
  providers: [LancamentosService],
})
export class LancamentosModule {}
