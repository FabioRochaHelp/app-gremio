import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  CODIGO_PRIMEIRO_ACESSO,
  type AtivarInput,
  type LoginInput,
  type RespostaLogin,
  type TrocarSenhaInput,
  type UsuarioSessao,
} from '@gremio/shared';
import type { Associado } from '@prisma/client';
import { compare, hash, hashSync } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { definirAutor } from '../common/contexto';
import { PrismaService } from '../prisma/prisma.service';
import { hashConvite } from './convite';
import type { PayloadAcesso } from './jwt.strategy';

interface PayloadRefresh {
  sub: string;
  v: number;
}

export interface Sessao extends RespostaLogin {
  refreshToken: string;
}

const CUSTO_BCRYPT = 12;
// Hash fixo para comparar mesmo quando o RE não existe e não revelar isso pelo tempo de resposta.
const HASH_FALSO = hashSync('re-inexistente', CUSTO_BCRYPT);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login({ re, senha }: LoginInput): Promise<Sessao> {
    const associado = await this.prisma.db.associado.findUnique({ where: { re } });
    const valida = await compare(senha, associado?.senhaHash ?? HASH_FALSO);
    if (!associado?.senhaHash || !valida) {
      throw new UnauthorizedException('RE ou senha incorretos');
    }
    return this.emitirSessao(associado);
  }

  async ativar({ re, codigo, senha }: AtivarInput): Promise<Sessao> {
    const associado = await this.prisma.db.associado.findUnique({ where: { re } });
    const convite = associado?.codigoConvite;
    // Tesoureiro nunca ativa com a palavra fixa, nem se foi promovido com o convite ainda pendente.
    const palavraFixa = codigo.toUpperCase() === CODIGO_PRIMEIRO_ACESSO;
    const valido =
      convite &&
      associado.conviteExpiraEm &&
      associado.conviteExpiraEm > new Date() &&
      !(palavraFixa && associado.perfil === 'TESOUREIRO') &&
      timingSafeEqual(Buffer.from(convite), Buffer.from(hashConvite(codigo)));
    if (!associado || !valido) {
      throw new UnauthorizedException('Código de convite inválido ou expirado');
    }
    definirAutor(associado.id);
    const atualizado = await this.prisma.db.associado.update({
      where: { id: associado.id },
      data: {
        senhaHash: await hash(senha, CUSTO_BCRYPT),
        codigoConvite: null,
        conviteExpiraEm: null,
        tokenVersao: { increment: 1 },
      },
    });
    return this.emitirSessao(atualizado);
  }

  async renovar(refreshToken: string | undefined): Promise<Sessao> {
    if (!refreshToken) throw new UnauthorizedException();
    let payload: PayloadRefresh;
    try {
      payload = await this.jwt.verifyAsync<PayloadRefresh>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException();
    }
    const associado = await this.prisma.db.associado.findUnique({ where: { id: payload.sub } });
    if (!associado?.senhaHash || associado.tokenVersao !== payload.v) {
      throw new UnauthorizedException();
    }
    return this.emitirSessao(associado);
  }

  async aceitarTermo(id: string): Promise<UsuarioSessao> {
    const associado = await this.prisma.db.associado.update({
      where: { id },
      data: { termoAceitoEm: new Date() },
    });
    return paraSessao(associado);
  }

  async trocarSenha(id: string, { senhaAtual, novaSenha }: TrocarSenhaInput): Promise<Sessao> {
    const associado = await this.prisma.db.associado.findUniqueOrThrow({ where: { id } });
    if (!associado.senhaHash || !(await compare(senhaAtual, associado.senhaHash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const atualizado = await this.prisma.db.associado.update({
      where: { id },
      data: { senhaHash: await hash(novaSenha, CUSTO_BCRYPT), tokenVersao: { increment: 1 } },
    });
    return this.emitirSessao(atualizado);
  }

  async perfil(id: string): Promise<UsuarioSessao> {
    return paraSessao(await this.prisma.db.associado.findUniqueOrThrow({ where: { id } }));
  }

  private async emitirSessao(associado: Associado): Promise<Sessao> {
    const acesso: PayloadAcesso = { sub: associado.id, v: associado.tokenVersao };
    const refresh: PayloadRefresh = { sub: associado.id, v: associado.tokenVersao };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(acesso, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwt.signAsync(refresh, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL', '30d'),
      }),
    ]);
    return { accessToken, refreshToken, usuario: paraSessao(associado) };
  }
}

function paraSessao(associado: Associado): UsuarioSessao {
  return {
    id: associado.id,
    nome: associado.nome,
    re: associado.re,
    perfil: associado.perfil,
    termoAceito: associado.termoAceitoEm !== null,
  };
}
