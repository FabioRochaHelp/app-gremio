import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatarCentavos, type InscricaoPushInput } from '@gremio/shared';
import webpush, { WebPushError } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface AvisoPush {
  titulo: string;
  corpo: string;
  url: string;
}

const LIMITE_CORPO = 140;

/** Web Push (VAPID): avisa todos os associados a cada lançamento, sem dados pessoais no conteúdo. */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);
  private readonly chavePublica: string | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publica = config.get<string>('VAPID_PUBLIC_KEY');
    const privada = config.get<string>('VAPID_PRIVATE_KEY');
    this.chavePublica = publica && privada ? publica : null;
    if (publica && privada) {
      webpush.setVapidDetails(config.get('VAPID_SUBJECT', 'mailto:tesouraria@example.com'), publica, privada);
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes: notificações desligadas');
    }
  }

  obterChavePublica(): { chave: string | null } {
    return { chave: this.chavePublica };
  }

  async inscrever(associadoId: string, { endpoint, keys }: InscricaoPushInput): Promise<void> {
    // O mesmo aparelho pode trocar de usuário: o endpoint passa a ser de quem se inscreveu por último.
    await this.prisma.db.pushSubscription.upsert({
      where: { endpoint },
      create: { associadoId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { associadoId, p256dh: keys.p256dh, auth: keys.auth },
    });
  }

  async cancelar(associadoId: string, endpoint: string): Promise<void> {
    await this.prisma.db.pushSubscription.deleteMany({ where: { associadoId, endpoint } });
  }

  async avisarLancamento(lancamentoId: string): Promise<{ enviados: number; removidos: number }> {
    const lancamento = await this.prisma.db.lancamento.findUnique({
      where: { id: lancamentoId },
      include: { categoria: true, estornoDe: true },
    });
    // Baixas de mensalidade (e seus estornos) não geram aviso: seriam muitas e indicariam quem pagou.
    if (!lancamento || lancamento.mensalidadeId) return { enviados: 0, removidos: 0 };

    const valor = formatarCentavos(lancamento.valor);
    const [titulo, corpo] = {
      SAIDA: [`Despesa: ${valor}`, `${lancamento.categoria?.nome ?? 'Sem categoria'} — ${lancamento.descricao}`],
      ENTRADA: [`Entrada: ${valor}`, lancamento.descricao],
      ESTORNO: [`Estorno: ${valor}`, `${lancamento.estornoDe?.descricao} — ${lancamento.motivoEstorno}`],
    }[lancamento.tipo];

    return this.enviarParaTodos({
      titulo,
      corpo: corpo.length > LIMITE_CORPO ? `${corpo.slice(0, LIMITE_CORPO - 1)}…` : corpo,
      url: `/extrato/${lancamento.id}`,
    });
  }

  async enviarParaTodos(aviso: AvisoPush): Promise<{ enviados: number; removidos: number }> {
    if (!this.chavePublica) return { enviados: 0, removidos: 0 };
    const inscricoes = await this.prisma.db.pushSubscription.findMany();
    const conteudo = JSON.stringify(aviso);
    let enviados = 0;
    const expiradas: string[] = [];

    await Promise.all(
      inscricoes.map(async (inscricao) => {
        try {
          await webpush.sendNotification(
            { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
            conteudo,
            { TTL: 24 * 60 * 60 },
          );
          enviados++;
        } catch (erro) {
          // 404/410: o navegador cancelou a inscrição (app desinstalado, permissão revogada).
          if (erro instanceof WebPushError && (erro.statusCode === 404 || erro.statusCode === 410)) {
            expiradas.push(inscricao.id);
          } else {
            this.logger.warn(`Falha ao enviar push para ${inscricao.id}: ${erro}`);
          }
        }
      }),
    );

    if (expiradas.length) {
      await this.prisma.db.pushSubscription.deleteMany({ where: { id: { in: expiradas } } });
    }
    return { enviados, removidos: expiradas.length };
  }
}
