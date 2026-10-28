import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { competenciaDe, FUSO } from '@gremio/shared';
import type { Job, Queue } from 'bullmq';
import { executarComContexto } from '../common/contexto';
import { ComprovantesModule } from '../comprovantes/comprovantes.module';
import { ComprovantesService } from '../comprovantes/comprovantes.service';
import { FechamentosModule } from '../fechamentos/fechamentos.module';
import { FechamentosService } from '../fechamentos/fechamentos.service';
import { MensalidadesModule } from '../mensalidades/mensalidades.module';
import { MensalidadesService } from '../mensalidades/mensalidades.service';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  DadosAvisarLancamento,
  DadosGerarPrestacao,
  DadosLerComprovante,
  FILA_AGENDADOS,
  FILA_COMPROVANTES,
  FILA_NOTIFICACOES,
  FILA_RELATORIOS,
  JOB_GERAR_MENSALIDADES,
  JOB_INADIMPLENCIA,
} from './filas';

// Jobs rodam fora de uma requisição: o contexto vazio faz a auditoria registrá-los sem autor (sistema).

@Processor(FILA_COMPROVANTES)
export class ComprovantesProcessor extends WorkerHost {
  constructor(private readonly comprovantes: ComprovantesService) {
    super();
  }

  process(job: Job<DadosLerComprovante>) {
    return executarComContexto({}, () => this.comprovantes.processar(job.data.mensalidadeId));
  }

  @OnWorkerEvent('failed')
  async aoFalhar(job: Job<DadosLerComprovante> | undefined) {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await executarComContexto({}, () => this.comprovantes.falhou(job.data.mensalidadeId));
    }
  }
}

@Processor(FILA_NOTIFICACOES)
export class NotificacoesProcessor extends WorkerHost {
  constructor(private readonly notificacoes: NotificacoesService) {
    super();
  }

  process(job: Job<DadosAvisarLancamento>) {
    return executarComContexto({}, () => this.notificacoes.avisarLancamento(job.data.lancamentoId));
  }
}

// Um PDF por vez: o Chrome do Puppeteer pesa numa VPS pequena.
@Processor(FILA_RELATORIOS, { concurrency: 1 })
export class RelatoriosProcessor extends WorkerHost {
  constructor(private readonly fechamentos: FechamentosService) {
    super();
  }

  process(job: Job<DadosGerarPrestacao>) {
    return executarComContexto({}, () => this.fechamentos.gerarPrestacao(job.data.competencia));
  }
}

@Processor(FILA_AGENDADOS)
export class AgendadosProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendadosProcessor.name);

  constructor(
    @InjectQueue(FILA_AGENDADOS) private readonly fila: Queue,
    private readonly mensalidades: MensalidadesService,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    // Dia 1 de cada mês, logo após a meia-noite, gera as mensalidades do mês.
    await this.fila.upsertJobScheduler(
      JOB_GERAR_MENSALIDADES,
      { pattern: '5 0 1 * *', tz: FUSO },
      { name: JOB_GERAR_MENSALIDADES },
    );
    await this.fila.upsertJobScheduler(JOB_INADIMPLENCIA, { pattern: '0 6 * * *', tz: FUSO }, { name: JOB_INADIMPLENCIA });
  }

  async process(job: Job) {
    return executarComContexto({}, async () => {
      if (job.name === JOB_GERAR_MENSALIDADES) {
        const resultado = await this.mensalidades.gerar(competenciaDe(new Date()));
        this.logger.log(`Mensalidades geradas: ${resultado.criadas}`);
        return resultado;
      }
      if (job.name === JOB_INADIMPLENCIA) {
        return this.mensalidades.atualizarInadimplencia();
      }
    });
  }
}

@Module({
  imports: [MensalidadesModule, ComprovantesModule, NotificacoesModule, FechamentosModule],
  providers: [ComprovantesProcessor, NotificacoesProcessor, RelatoriosProcessor, AgendadosProcessor],
})
export class ProcessadoresModule {}
