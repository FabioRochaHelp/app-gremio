import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VALIDADE_URL_SEGUNDOS = 10 * 60;

/** Comprovantes e PDFs em um bucket S3-compatível (SeaweedFS em dev; SeaweedFS ou R2 em produção). */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly cliente: S3Client;
  // URLs assinadas usam o endereço que o navegador alcança, que pode ser diferente
  // do endereço interno usado pela API (ex.: nome do serviço no Docker).
  private readonly clientePublico: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow('S3_BUCKET');
    const base = {
      region: config.get('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    };
    const endpoint = config.getOrThrow<string>('S3_ENDPOINT');
    this.cliente = new S3Client({ ...base, endpoint });
    this.clientePublico = new S3Client({ ...base, endpoint: config.get('S3_ENDPOINT_PUBLICO') || endpoint });
  }

  async onModuleInit() {
    try {
      await this.cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Criando bucket ${this.bucket}`);
      await this.cliente.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async enviar(chave: string, conteudo: Buffer, tipo: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: chave, Body: conteudo, ContentType: tipo }),
    );
  }

  async baixar(chave: string): Promise<Buffer> {
    const resposta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    return Buffer.from(await resposta.Body!.transformToByteArray());
  }

  /** Link temporário para o navegador abrir o arquivo sem passar pela API. */
  urlTemporaria(chave: string): Promise<string> {
    return getSignedUrl(this.clientePublico, new GetObjectCommand({ Bucket: this.bucket, Key: chave }), {
      expiresIn: VALIDADE_URL_SEGUNDOS,
    });
  }
}
