import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Perfil } from '@prisma/client';
import { definirAutor } from '../common/contexto';
import { CHAVE_PERFIS, CHAVE_PUBLICO, CHAVE_SEM_TERMO, UsuarioAutenticado } from './decorators';

function metadado<T>(reflector: Reflector, chave: string, ctx: ExecutionContext): T | undefined {
  return reflector.getAllAndOverride<T>(chave, [ctx.getHandler(), ctx.getClass()]);
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (metadado<boolean>(this.reflector, CHAVE_PUBLICO, ctx)) return true;
    await super.canActivate(ctx);
    const usuario: UsuarioAutenticado = ctx.switchToHttp().getRequest().user;
    definirAutor(usuario.id);
    return true;
  }
}

@Injectable()
export class PerfilGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const perfis = metadado<Perfil[]>(this.reflector, CHAVE_PERFIS, ctx);
    if (!perfis?.length) return true;
    const usuario: UsuarioAutenticado | undefined = ctx.switchToHttp().getRequest().user;
    if (!usuario || !perfis.includes(usuario.perfil)) {
      throw new ForbiddenException('Acesso restrito ao tesoureiro');
    }
    return true;
  }
}

@Injectable()
export class TermoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (metadado<boolean>(this.reflector, CHAVE_PUBLICO, ctx)) return true;
    if (metadado<boolean>(this.reflector, CHAVE_SEM_TERMO, ctx)) return true;
    const usuario: UsuarioAutenticado = ctx.switchToHttp().getRequest().user;
    if (!usuario.termoAceito) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Aceite o termo de uso para continuar',
        codigo: 'TERMO_PENDENTE',
      });
    }
    return true;
  }
}
