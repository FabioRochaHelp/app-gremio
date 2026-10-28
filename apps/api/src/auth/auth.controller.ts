import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ativarSchema,
  loginSchema,
  trocarSenhaSchema,
  type AtivarInput,
  type LoginInput,
  type RespostaLogin,
  type TrocarSenhaInput,
  type UsuarioSessao,
} from '@gremio/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService, Sessao } from './auth.service';
import { Publico, SemTermo, Usuario, type UsuarioAutenticado } from './decorators';

const COOKIE_REFRESH = 'gremio_refresh';
const LIMITE_TENTATIVAS = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Publico()
  @Throttle(LIMITE_TENTATIVAS)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) dados: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaLogin> {
    return this.responder(await this.auth.login(dados), res);
  }

  @Publico()
  @Throttle(LIMITE_TENTATIVAS)
  @Post('ativar')
  @HttpCode(200)
  async ativar(
    @Body(new ZodPipe(ativarSchema)) dados: AtivarInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaLogin> {
    return this.responder(await this.auth.ativar(dados), res);
  }

  @Publico()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<RespostaLogin> {
    return this.responder(await this.auth.renovar(req.cookies?.[COOKIE_REFRESH]), res);
  }

  @Publico()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(COOKIE_REFRESH, this.opcoesCookie());
  }

  @SemTermo()
  @Get('me')
  me(@Usuario() usuario: UsuarioAutenticado): Promise<UsuarioSessao> {
    return this.auth.perfil(usuario.id);
  }

  @SemTermo()
  @Post('termo')
  @HttpCode(200)
  aceitarTermo(@Usuario() usuario: UsuarioAutenticado): Promise<UsuarioSessao> {
    return this.auth.aceitarTermo(usuario.id);
  }

  @SemTermo()
  @Post('senha')
  @HttpCode(200)
  async trocarSenha(
    @Usuario() usuario: UsuarioAutenticado,
    @Body(new ZodPipe(trocarSenhaSchema)) dados: TrocarSenhaInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaLogin> {
    return this.responder(await this.auth.trocarSenha(usuario.id, dados), res);
  }

  private responder({ refreshToken, ...sessao }: Sessao, res: Response): RespostaLogin {
    res.cookie(COOKIE_REFRESH, refreshToken, {
      ...this.opcoesCookie(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return sessao;
  }

  private opcoesCookie(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/auth',
    };
  }
}
