import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClienteGremio, criarClienteGremio } from './extensoes';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base = new PrismaClient();
  /** Use sempre este cliente: ele aplica imutabilidade e auditoria. */
  readonly db: ClienteGremio = criarClienteGremio(this.base);

  async onModuleInit() {
    await this.base.$connect();
  }

  async onModuleDestroy() {
    await this.base.$disconnect();
  }
}
