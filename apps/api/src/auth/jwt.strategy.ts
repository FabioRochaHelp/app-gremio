import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from './decorators';

export interface PayloadAcesso {
  sub: string;
  v: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Recarrega o associado a cada requisição para que mudanças de perfil ou senha
  // valham na hora, sem esperar o token expirar.
  async validate(payload: PayloadAcesso): Promise<UsuarioAutenticado> {
    const associado = await this.prisma.db.associado.findUnique({ where: { id: payload.sub } });
    if (!associado || !associado.senhaHash || associado.tokenVersao !== payload.v) {
      throw new UnauthorizedException();
    }
    return {
      id: associado.id,
      nome: associado.nome,
      re: associado.re,
      perfil: associado.perfil,
      termoAceito: associado.termoAceitoEm !== null,
    };
  }
}
