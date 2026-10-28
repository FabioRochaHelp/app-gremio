import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { executarComContexto } from '../src/common/contexto';

/** Sobe a API como em main.ts, sem abrir porta. */
export async function criarApp(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  app.setGlobalPrefix('api');
  app.use((_req: unknown, _res: unknown, next: () => void) => executarComContexto({}, next));
  app.use(cookieParser());
  await app.init();
  return app;
}

/** Cria um associado já ativado e com termo aceito, e devolve o token de acesso. */
export async function criarAssociado(
  app: INestApplication,
  base: PrismaClient,
  dados: { re: string; nome?: string; perfil?: 'ASSOCIADO' | 'TESOUREIRO' },
): Promise<{ id: string; token: string }> {
  const senha = `senha-${dados.re}`;
  const associado = await base.associado.create({
    data: {
      nome: dados.nome ?? `Associado ${dados.re}`,
      re: dados.re,
      posto: 'Sd',
      unidade: 'GB',
      perfil: dados.perfil ?? 'ASSOCIADO',
      senhaHash: await hash(senha, 4),
      termoAceitoEm: new Date(),
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ re: dados.re, senha }).expect(200);
  return { id: associado.id, token: res.body.accessToken };
}
