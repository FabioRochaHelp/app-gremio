import { Injectable } from '@nestjs/common';
import type { CobrancaPixDto } from '@gremio/shared';
import type { Mensalidade } from '@prisma/client';
import { toString as qrSvg } from 'qrcode';
import { ConfiguracaoService } from '../configuracao/configuracao.service';
import { gerarBrCode } from './brcode';

@Injectable()
export class PixService {
  constructor(private readonly configuracao: ConfiguracaoService) {}

  async cobranca(mensalidade: Mensalidade): Promise<CobrancaPixDto> {
    const config = await this.configuracao.obter();
    const copiaECola = gerarBrCode({
      chave: config.chavePix,
      nomeRecebedor: config.nomeRecebedor,
      cidade: config.cidade,
      valor: mensalidade.valor,
      // Identifica a mensalidade no extrato do banco, ajudando a conferência no fechamento.
      txid: `M${mensalidade.competencia.replace('-', '')}${mensalidade.id.replace(/-/g, '').slice(0, 12)}`,
    });
    const svg = await qrSvg(copiaECola, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return {
      copiaECola,
      qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      valor: mensalidade.valor,
      chavePix: config.chavePix,
      nomeRecebedor: config.nomeRecebedor,
    };
  }
}
