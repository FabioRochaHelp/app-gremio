// Processo separado para as filas em produção (a API roda com PROCESSAR_FILAS=false):
// leitura de comprovantes e tarefas agendadas não disputam CPU com as requisições.
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MODULOS_BASE } from './app.module';
import { ProcessadoresModule } from './filas/processadores';

@Module({ imports: [...MODULOS_BASE, ProcessadoresModule] })
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

bootstrap();
