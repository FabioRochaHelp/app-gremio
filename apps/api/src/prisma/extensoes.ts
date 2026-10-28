import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { contextoAtual } from '../common/contexto';

// Primeira camada da imutabilidade; a segunda são os triggers da migration init.
const IMUTAVEIS = new Set<Prisma.ModelName>(['Lancamento', 'AuditLog', 'FechamentoMensal']);
const OPERACOES_DE_ALTERACAO = new Set(['update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const OPERACOES_AUDITADAS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);
const CAMPOS_SENSIVEIS = ['senhaHash', 'codigoConvite', 'p256dh', 'auth'];

function alteracaoPermitida(model: string, operation: string, args: any): boolean {
  // Única exceção: a fila grava o PDF da prestação de contas depois do fechamento.
  return (
    model === 'FechamentoMensal' &&
    operation === 'update' &&
    Object.keys(args?.data ?? {}).every((campo) => campo === 'pdfKey')
  );
}

function semCamposSensiveis(valor: unknown): Prisma.InputJsonValue {
  const copia = JSON.parse(JSON.stringify(valor ?? {}));
  if (copia && typeof copia === 'object') {
    for (const campo of CAMPOS_SENSIVEIS) {
      if (campo in copia) copia[campo] = '[omitido]';
    }
  }
  return copia;
}

/**
 * Cliente Prisma com as regras de transparência:
 * - bloqueia edição/remoção de lançamentos, fechamentos e auditoria;
 * - registra no audit_log toda escrita nos demais modelos, com o autor da requisição.
 *
 * A gravação da auditoria usa o cliente base, fora de uma eventual transação; se a
 * transação for desfeita, a entrada de auditoria permanece como registro da tentativa.
 */
export function criarClienteGremio(base: PrismaClient) {
  return base.$extends({
    name: 'gremio-transparencia',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (
            IMUTAVEIS.has(model) &&
            OPERACOES_DE_ALTERACAO.has(operation) &&
            !alteracaoPermitida(model, operation, args)
          ) {
            throw new ConflictException(
              `${model} é imutável: corrija com um estorno em vez de ${operation}`,
            );
          }

          const resultado = await query(args);

          if (model !== 'AuditLog' && OPERACOES_AUDITADAS.has(operation)) {
            const unico = !operation.endsWith('Many');
            await base.auditLog.create({
              data: {
                tabela: model,
                registroId: unico ? String((resultado as any)?.id ?? '') : '*',
                acao: operation,
                autorId: contextoAtual()?.autorId ?? null,
                dados: semCamposSensiveis(unico ? resultado : { args, resultado }),
              },
            });
          }

          return resultado;
        },
      },
    },
  });
}

export type ClienteGremio = ReturnType<typeof criarClienteGremio>;
