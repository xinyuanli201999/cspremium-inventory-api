import { S3Client } from '@aws-sdk/client-s3';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver } from './drivers/local.driver';
import { S3StorageDriver } from './drivers/s3.driver';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';

export function createStorageDriver(config: ConfigService): StorageDriver {
  const logger = new Logger('Storage');
  const s = config.getOrThrow<{
    bucket?: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
    endpoint?: string;
  }>('storage');

  if (!s.bucket) {
    logger.log('Image storage: local disk (set S3_BUCKET_NAME to use S3)');
    return new LocalStorageDriver();
  }

  if (!!s.accessKeyId !== !!s.secretAccessKey) {
    throw new Error(
      'Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or leave both empty to use an IAM role.',
    );
  }

  const client = new S3Client({
    region: s.region,
    // Without explicit keys the SDK uses the default chain (IAM role, SSO, env, ~/.aws)
    ...(s.accessKeyId && s.secretAccessKey
      ? { credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey } }
      : {}),
    ...(s.endpoint
      ? {
          endpoint: s.endpoint,
          forcePathStyle: true,
          // Many S3-compatible services do not understand the SDK's default checksum headers
          requestChecksumCalculation: 'WHEN_REQUIRED' as const,
          responseChecksumValidation: 'WHEN_REQUIRED' as const,
        }
      : {}),
  });

  logger.log(
    `Image storage: S3 bucket "${s.bucket}" (${s.region})${s.endpoint ? ` via ${s.endpoint}` : ''}${
      s.publicBaseUrl ? `, public URL ${s.publicBaseUrl}` : ''
    }`,
  );
  return new S3StorageDriver({
    client,
    bucket: s.bucket,
    region: s.region,
    publicBaseUrl: s.publicBaseUrl,
    endpoint: s.endpoint,
  });
}

@Global()
@Module({
  providers: [
    { provide: STORAGE_DRIVER, inject: [ConfigService], useFactory: createStorageDriver },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
