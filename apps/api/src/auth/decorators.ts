import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Perfil } from '@prisma/client';

export const CHAVE_PUBLICO = 'publico';
export const CHAVE_PERFIS = 'perfis';
export const CHAVE_SEM_TERMO = 'semTermo';

/** Rota acessível sem login. */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

/** Restringe a rota aos perfis informados. */
export const Perfis = (...perfis: Perfil[]) => SetMetadata(CHAVE_PERFIS, perfis);

/** Rota liberada antes do aceite do termo de uso (LGPD). */
export const SemTermo = () => SetMetadata(CHAVE_SEM_TERMO, true);

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  re: string;
  perfil: Perfil;
  termoAceito: boolean;
}

export const Usuario = createParamDecorator(
  (_dados: unknown, ctx: ExecutionContext): UsuarioAutenticado => ctx.switchToHttp().getRequest().user,
);
