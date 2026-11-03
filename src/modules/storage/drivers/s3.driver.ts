import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { StorageDriver } from '../storage.types';

export interface S3DriverOptions {
  client: Pick<S3Client, 'send'>;
  bucket: string;
  region: string;
  /** CDN / custom domain, e.g. https://d123.cloudfront.net */
  publicBaseUrl?: string;
  /** S3-compatible endpoint (path-style URLs). */
  endpoint?: string;
}

// Keys contain a random UUID, so a stored object never changes: cache it "forever".
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private readonly baseUrl: string;

  constructor(private readonly opts: S3DriverOptions) {
    const trim = (s: string) => s.replace(/\/+$/, '');
    this.baseUrl = opts.publicBaseUrl
      ? trim(opts.publicBaseUrl)
      : opts.endpoint
        ? `${trim(opts.endpoint)}/${opts.bucket}`
        : `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    // No ACL: new buckets have ACLs disabled. Public access is granted by a bucket
    // policy or CloudFront (see docs/s3-setup.md).
    await this.opts.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    );
    return `${this.baseUrl}/${key}`;
  }

  async remove(key: string): Promise<void> {
    await this.opts.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.baseUrl}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
