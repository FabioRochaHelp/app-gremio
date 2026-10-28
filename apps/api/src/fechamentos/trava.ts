import type { Prisma } from '@prisma/client';

// Aceita o cliente estendido ou o de uma transação; só precisa contar fechamentos.
type ClienteFechamentos = {
  fechamentoMensal: { count(args: { where: Prisma.FechamentoMensalWhereInput }): PromiseLike<number> };
};

/**
 * Um mês fica travado se ele ou qualquer mês posterior já foi fechado: um lançamento
 * retroativo mudaria o saldo final de uma prestação de contas já publicada.
 */
export async function competenciaTravada(db: ClienteFechamentos, competencia: string): Promise<boolean> {
  return (await db.fechamentoMensal.count({ where: { competencia: { gte: competencia } } })) > 0;
}
