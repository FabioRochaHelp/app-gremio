import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

// Mensagens padrão em português; mensagens definidas nos schemas têm prioridade.
const mapaPt: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Campo obrigatório' : 'Valor inválido' };
    case ZodIssueCode.too_small:
      return {
        message:
          issue.type === 'string' ? `Mínimo de ${issue.minimum} caracteres` : `Mínimo: ${issue.minimum}`,
      };
    case ZodIssueCode.too_big:
      return {
        message:
          issue.type === 'string' ? `Máximo de ${issue.maximum} caracteres` : `Máximo: ${issue.maximum}`,
      };
    case ZodIssueCode.invalid_enum_value:
      return { message: 'Opção inválida' };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(mapaPt);
