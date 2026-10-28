// Ambiente isolado do E2E: banco, bucket e filas próprios, API e app em portas próprias.
// O banco gremio_e2e é recriado por e2e/preparar.mjs antes de cada execução.
export const PORTA_API = 4100;
export const PORTA_APP = 3100;
export const URL_APP = `http://localhost:${PORTA_APP}`;

export const AMBIENTE_API = {
  PORT: String(PORTA_API),
  DATABASE_URL: 'postgresql://gremio:gremio@localhost:5432/gremio_e2e?schema=public',
  S3_BUCKET: 'gremio-e2e',
  FILAS_PREFIXO: 'gremio-e2e',
  PROCESSAR_FILAS: 'true',
};
