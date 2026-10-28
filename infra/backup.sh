#!/bin/sh
# Backup diário do banco e dos arquivos (comprovantes, extratos e PDFs), guardando 14 dias.
# Os arquivos ficam no volume ./backups da VPS: copie para fora dela (outro provedor,
# nuvem, HD externo). Backup só na mesma máquina não protege contra perda da VPS.
set -eu

while true; do
  dia=$(date +%F)
  echo "[backup] $dia: iniciando"
  pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/banco-$dia.dump"
  tar -czf "/backups/arquivos-$dia.tgz" -C /s3data .
  find /backups -type f -mtime +14 -delete
  echo "[backup] $dia: concluído"
  sleep 86400
done
