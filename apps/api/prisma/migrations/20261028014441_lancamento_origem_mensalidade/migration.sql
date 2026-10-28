-- Vincula cada lançamento à mensalidade de origem, de forma permanente. Antes o vínculo
-- existia só em mensalidades.lancamento_id, que é limpo quando a baixa é estornada; sem ele,
-- a entrada estornada perderia a restrição de pagador e comprovante.
ALTER TABLE "lancamentos" ADD COLUMN "mensalidade_id" TEXT;

ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_mensalidade_id_fkey"
  FOREIGN KEY ("mensalidade_id") REFERENCES "mensalidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "lancamentos_mensalidade_id_idx" ON "lancamentos"("mensalidade_id");

-- Preenche os lançamentos existentes. É a única alteração permitida em lançamentos já gravados:
-- a trava de imutabilidade é suspensa só durante esta migration, que roda numa transação.
ALTER TABLE "lancamentos" DISABLE TRIGGER lancamentos_imutaveis;

UPDATE "lancamentos" l SET "mensalidade_id" = m."id"
  FROM "mensalidades" m WHERE m."lancamento_id" = l."id";

UPDATE "lancamentos" e SET "mensalidade_id" = o."mensalidade_id"
  FROM "lancamentos" o WHERE e."estorno_de_id" = o."id" AND o."mensalidade_id" IS NOT NULL;

ALTER TABLE "lancamentos" ENABLE TRIGGER lancamentos_imutaveis;
