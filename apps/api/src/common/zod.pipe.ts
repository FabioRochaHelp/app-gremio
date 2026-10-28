import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

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
