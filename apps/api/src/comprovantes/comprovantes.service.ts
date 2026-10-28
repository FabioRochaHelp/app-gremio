import { Injectable, Logger } from '@nestjs/common';
import type { DadosExtraidos } from '@gremio/shared';
import { Prisma } from '@prisma/client';
import { ConfiguracaoService } from '../configuracao/configuracao.service';
import { MensalidadesService } from '../mensalidades/mensalidades.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { lerComprovante } from './leitura';
import { extrairTexto } from './pdf';
import { recebedorConfere, validarComprovante } from './validacao';

// Abaixo disso o PDF é imagem (escaneado/foto) e não há o que ler.
const MINIMO_CARACTERES = 40;

/** Baixa automática pelo comprovante: lê o PDF, aplica as 4 checagens e dá a baixa ou manda para revisão. */
@Injectable()
export class ComprovantesService {
  private readonly logger = new Logger(ComprovantesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configuracao: ConfiguracaoService,
    private readonly mensalidades: MensalidadesService,
  ) {}

  async processar(mensalidadeId: string): Promise<void> {
    const mensalidade = await this.prisma.db.mensalidade.findUnique({ where: { id: mensalidadeId } });
    if (mensalidade?.status !== 'EM_ANALISE' || !mensalidade.comprovanteKey) return;

    // Falha ao baixar o arquivo é erro técnico: propaga para a fila tentar de novo.
    const pdf = await this.storage.baixar(mensalidade.comprovanteKey);

    let texto: string;
    try {
      texto = await extrairTexto(pdf);
    } catch (erro) {
      this.logger.warn(`PDF ilegível na mensalidade ${mensalidadeId}: ${erro}`);
      return this.mensalidades.enviarParaRevisao(mensalidadeId, 'Não foi possível abrir o PDF', null);
    }
    if (texto.replace(/\s/g, '').length < MINIMO_CARACTERES) {
      return this.mensalidades.enviarParaRevisao(
        mensalidadeId,
        'O PDF não tem texto (parece escaneado ou foto); confira manualmente',
        null,
      );
    }

    const dados = lerComprovante(texto);
    const config = await this.configuracao.obter();
    const recebedor = { chavePix: config.chavePix, cnpj: config.cnpj };
    // Conta também a própria mensalidade: se a baixa dela foi estornada, o E2E continua gravado
    // e o mesmo comprovante não pode ser aceito de novo.
    const e2eJaUsado =
      !!dados.e2eId && (await this.prisma.db.mensalidade.count({ where: { e2eId: dados.e2eId } })) > 0;

    const extraidos: DadosExtraidos = {
      banco: dados.banco,
      valor: dados.valor,
      data: dados.data?.toISOString() ?? null,
      e2eId: dados.e2eId,
      recebedorConfere: recebedorConfere(texto, recebedor),
    };

    const resultado = validarComprovante(dados, texto, {
      recebedor,
      valorMensalidade: mensalidade.valor,
      competencia: mensalidade.competencia,
      e2eJaUsado,
      agora: new Date(),
    });
    if (!resultado.aprovado) {
      return this.mensalidades.enviarParaRevisao(mensalidadeId, resultado.motivo, extraidos);
    }

    await this.prisma.db.mensalidade.update({
      where: { id: mensalidadeId },
      data: { dadosExtraidos: extraidos as unknown as Prisma.InputJsonValue },
    });
    try {
      await this.mensalidades.registrarBaixa(mensalidadeId, {
        tipoBaixa: 'AUTOMATICA',
        e2eId: dados.e2eId,
        dataPagamento: dados.data,
        autorId: mensalidade.associadoId,
      });
    } catch (erro) {
      // Outro envio com o mesmo E2E venceu a corrida entre a checagem e a baixa.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return this.mensalidades.enviarParaRevisao(
          mensalidadeId,
          'Este comprovante (ID da transação) já foi usado em outra mensalidade',
          extraidos,
        );
      }
      throw erro;
    }
  }

  /** Chamado quando a fila esgota as tentativas: o tesoureiro confere à mão. */
  async falhou(mensalidadeId: string): Promise<void> {
    const mensalidade = await this.prisma.db.mensalidade.findUnique({ where: { id: mensalidadeId } });
    if (mensalidade?.status !== 'EM_ANALISE') return;
    await this.mensalidades.enviarParaRevisao(
      mensalidadeId,
      'Falha técnica ao ler o comprovante; confira manualmente',
      null,
    );
  }
}
