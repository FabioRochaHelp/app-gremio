import { Module } from '@nestjs/common';
import { ConfiguracaoModule } from '../configuracao/configuracao.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FechamentosController } from './fechamentos.controller';
import { FechamentosService } from './fechamentos.service';

@Module({
  imports: [ConfiguracaoModule, NotificacoesModule],
  controllers: [FechamentosController],
  providers: [FechamentosService],
  exports: [FechamentosService],
})
export class FechamentosModule {}
