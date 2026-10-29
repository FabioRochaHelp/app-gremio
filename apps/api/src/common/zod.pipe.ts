import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // A entrada é o corpo cru da requisição; só a saída precisa ter o tipo T.
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);
    if (!resultado.success) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        erros: resultado.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    return resultado.data;
  }
}
