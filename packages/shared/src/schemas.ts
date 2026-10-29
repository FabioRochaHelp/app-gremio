import './zod-pt';
import { z } from 'zod';
import { Perfil, Situacao } from './enums';

// RE: apenas dígitos, para não depender de formatação com ponto ou traço.
const re = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().min(3, 'RE inválido').max(12, 'RE inválido'));

// Celular com DDD; vazio vira null. Guardado como 55 + DDD + número, formato usado pelo WhatsApp.
const celular = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, '').replace(/^55(?=\d{11}$)/, ''))
  .pipe(z.union([z.literal(''), z.string().regex(/^[1-9]{2}9\d{8}$/, 'Celular inválido: informe DDD e os 9 dígitos')]))
  .transform((v) => (v ? `55${v}` : null));

const senha = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(128);

export const loginSchema = z.object({
  re,
  senha: z.string().min(1, 'Informe a senha'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Código do primeiro acesso de associados: fácil de passar, e o convite ainda expira em 7 dias.
 * Redefinição de senha e contas de tesoureiro usam código aleatório de 8 caracteres.
 */
export const CODIGO_PRIMEIRO_ACESSO = 'ACEITAR';

export const ativarSchema = z.object({
  re,
  codigo: z.string().trim().toUpperCase().min(7, 'Código inválido').max(8, 'Código inválido'),
  senha,
});
export type AtivarInput = z.infer<typeof ativarSchema>;

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: senha,
});
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;

export const criarAssociadoSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  re,
  posto: z.string().trim().min(1).max(60),
  unidade: z.string().trim().min(1).max(120),
  celular: celular.optional(),
  perfil: z.nativeEnum(Perfil).default(Perfil.ASSOCIADO),
  situacao: z.nativeEnum(Situacao).default(Situacao.ATIVO),
});
export type CriarAssociadoInput = z.infer<typeof criarAssociadoSchema>;

// O RE pode ser corrigido: o login usa o id na sessão, então a troca não derruba quem já está logado.
export const atualizarAssociadoSchema = criarAssociadoSchema.partial();
export type AtualizarAssociadoInput = z.infer<typeof atualizarAssociadoSchema>;

export const configSchema = z.object({
  valorMensalidade: z.number().int().positive(),
  chavePix: z.string().trim().min(1).max(77),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().length(14, 'CNPJ deve ter 14 dígitos'))
    .nullable(),
  nomeRecebedor: z.string().trim().min(1).max(25),
  cidade: z.string().trim().min(1).max(15),
});
export type ConfigInput = z.infer<typeof configSchema>;

export const categoriaSchema = z.object({
  nome: z.string().trim().min(2).max(40),
  ativa: z.boolean().default(true),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

// ID fim-a-fim do Pix: "E" + ISPB (8) + data/hora AAAAMMDDHHmm (12) + sequencial (11).
export const REGEX_E2E = /^E\d{8}\d{12}[A-Za-z0-9]{11}$/;

export const gerarMensalidadesSchema = z.object({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência inválida (use AAAA-MM)'),
});
export type GerarMensalidadesInput = z.infer<typeof gerarMensalidadesSchema>;

export const aprovarMensalidadeSchema = z.object({
  e2eId: z
    .string()
    .trim()
    .regex(REGEX_E2E, 'ID da transação inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type AprovarMensalidadeInput = z.infer<typeof aprovarMensalidadeSchema>;

export const recusarMensalidadeSchema = z.object({
  motivo: z.string().trim().min(5, 'Explique o motivo para o associado').max(300),
});
export type RecusarMensalidadeInput = z.infer<typeof recusarMensalidadeSchema>;

// Campos chegam como texto porque o lançamento é enviado em multipart, junto com a foto.
export const lancamentoSchema = z
  .object({
    tipo: z.enum(['ENTRADA', 'SAIDA']),
    categoriaId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    valor: z.coerce.number().int('Valor inválido').positive('Informe o valor'),
    descricao: z.string().trim().min(5, 'Explique o lançamento').max(300),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((l) => l.tipo !== 'SAIDA' || l.categoriaId, {
    message: 'Escolha a categoria da despesa',
    path: ['categoriaId'],
  });
export type LancamentoInput = z.infer<typeof lancamentoSchema>;

export const estornoSchema = z.object({
  motivo: z.string().trim().min(5, 'Explique o motivo do estorno').max(300),
});
export type EstornoInput = z.infer<typeof estornoSchema>;

export const inscricaoPushSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type InscricaoPushInput = z.infer<typeof inscricaoPushSchema>;

export const competenciaQuerySchema = z.object({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência inválida (use AAAA-MM)'),
});

export const fecharMesSchema = z.object({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência inválida (use AAAA-MM)'),
  // Centavos; pode ser negativo (conta no cheque especial).
  saldoBanco: z.coerce.number().int('Saldo inválido'),
});
export type FecharMesInput = z.infer<typeof fecharMesSchema>;
