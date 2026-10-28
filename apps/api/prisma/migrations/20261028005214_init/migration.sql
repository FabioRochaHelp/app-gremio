-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ASSOCIADO', 'TESOUREIRO');

-- CreateEnum
CREATE TYPE "Situacao" AS ENUM ('ATIVO', 'INADIMPLENTE', 'ISENTO');

-- CreateEnum
CREATE TYPE "StatusMensalidade" AS ENUM ('ABERTA', 'EM_ANALISE', 'EM_REVISAO', 'PAGA', 'ISENTA');

-- CreateEnum
CREATE TYPE "TipoBaixa" AS ENUM ('AUTOMATICA', 'MANUAL');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('ENTRADA', 'SAIDA', 'ESTORNO');

-- CreateTable
CREATE TABLE "associados" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "re" TEXT NOT NULL,
    "posto" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'ASSOCIADO',
    "situacao" "Situacao" NOT NULL DEFAULT 'ATIVO',
    "senha_hash" TEXT,
    "token_versao" INTEGER NOT NULL DEFAULT 0,
    "codigo_convite" TEXT,
    "convite_expira_em" TIMESTAMP(3),
    "termo_aceito_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "associados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "valor_mensalidade" INTEGER NOT NULL,
    "chave_pix" TEXT NOT NULL,
    "cnpj" TEXT,
    "nome_recebedor" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensalidades" (
    "id" TEXT NOT NULL,
    "associado_id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "status" "StatusMensalidade" NOT NULL DEFAULT 'ABERTA',
    "comprovante_key" TEXT,
    "e2e_id" TEXT,
    "tipo_baixa" "TipoBaixa",
    "motivo_recusa" TEXT,
    "dados_extraidos" JSONB,
    "lancamento_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mensalidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "categoria_id" TEXT,
    "valor" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "comprovante_key" TEXT,
    "autor_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "competencia" TEXT NOT NULL,
    "estorno_de_id" TEXT,
    "motivo_estorno" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamentos_mensais" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "saldo_sistema" INTEGER NOT NULL,
    "saldo_banco" INTEGER NOT NULL,
    "extrato_key" TEXT NOT NULL,
    "pdf_key" TEXT,
    "divergencias" JSONB NOT NULL,
    "fechado_por_id" TEXT NOT NULL,
    "fechado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fechamentos_mensais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "associado_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "tabela" TEXT NOT NULL,
    "registro_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "autor_id" TEXT,
    "dados" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "associados_re_key" ON "associados"("re");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "mensalidades_e2e_id_key" ON "mensalidades"("e2e_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensalidades_lancamento_id_key" ON "mensalidades"("lancamento_id");

-- CreateIndex
CREATE INDEX "mensalidades_status_idx" ON "mensalidades"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mensalidades_associado_id_competencia_key" ON "mensalidades"("associado_id", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_estorno_de_id_key" ON "lancamentos"("estorno_de_id");

-- CreateIndex
CREATE INDEX "lancamentos_competencia_idx" ON "lancamentos"("competencia");

-- CreateIndex
CREATE UNIQUE INDEX "fechamentos_mensais_competencia_key" ON "fechamentos_mensais"("competencia");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "audit_log_tabela_registro_id_idx" ON "audit_log"("tabela", "registro_id");

-- AddForeignKey
ALTER TABLE "mensalidades" ADD CONSTRAINT "mensalidades_associado_id_fkey" FOREIGN KEY ("associado_id") REFERENCES "associados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensalidades" ADD CONSTRAINT "mensalidades_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "lancamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "associados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "lancamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamentos_mensais" ADD CONSTRAINT "fechamentos_mensais_fechado_por_id_fkey" FOREIGN KEY ("fechado_por_id") REFERENCES "associados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_associado_id_fkey" FOREIGN KEY ("associado_id") REFERENCES "associados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Imutabilidade (docs/project.md, "Lançamentos imutáveis"): nada é editado ou
-- apagado; correções são estornos. Esta trava vale até para acesso direto ao banco.
CREATE FUNCTION bloquear_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % em % não é permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lancamentos_imutaveis
  BEFORE UPDATE OR DELETE ON "lancamentos"
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE TRIGGER audit_log_imutavel
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

-- O fechamento só aceita uma alteração: preencher o pdf_key uma única vez,
-- depois que a fila gera a prestação de contas.
CREATE FUNCTION proteger_fechamento() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.pdf_key IS NULL
     AND NEW.pdf_key IS NOT NULL
     AND (NEW.id, NEW.competencia, NEW.saldo_sistema, NEW.saldo_banco, NEW.extrato_key,
          NEW.divergencias, NEW.fechado_por_id, NEW.fechado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.competencia, OLD.saldo_sistema, OLD.saldo_banco, OLD.extrato_key,
          OLD.divergencias, OLD.fechado_por_id, OLD.fechado_em)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Fechamento mensal imutável: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fechamentos_imutaveis
  BEFORE UPDATE OR DELETE ON "fechamentos_mensais"
  FOR EACH ROW EXECUTE FUNCTION proteger_fechamento();
