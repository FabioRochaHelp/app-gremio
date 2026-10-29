export const URL_BANCO_TESTE =
  process.env.TEST_DATABASE_URL ?? 'postgresql://gremio:gremio@localhost:5435/gremio_test?schema=public';

// Carregado pelo Jest antes de cada arquivo de teste.
process.env.DATABASE_URL = URL_BANCO_TESTE;
process.env.JWT_ACCESS_SECRET = 'teste-access';
process.env.JWT_REFRESH_SECRET = 'teste-refresh';
process.env.S3_BUCKET = 'gremio-test';
process.env.FILAS_PREFIXO = 'gremio-test';
// Nos testes a leitura do comprovante é chamada diretamente, sem worker.
process.env.PROCESSAR_FILAS = 'false';
