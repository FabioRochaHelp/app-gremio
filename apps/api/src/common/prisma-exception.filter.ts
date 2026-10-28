import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

// Traduz erros conhecidos do Prisma em respostas HTTP em vez de 500.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(erro: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    switch (erro.code) {
      case 'P2002':
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Registro duplicado',
          campos: (erro.meta?.target as string[] | undefined) ?? [],
        });
      case 'P2025':
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ statusCode: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' });
      default:
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Erro interno' });
    }
  }
}
