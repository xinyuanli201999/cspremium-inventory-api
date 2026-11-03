import { registerAs } from '@nestjs/config';

/** "" and whitespace count as "not set" (an empty `KEY=` line in .env). */
const blank = (v?: string) => v?.trim() || undefined;

export default registerAs('storage', () => ({
  /** When set, product images go to S3; otherwise to local disk (backend/uploads). */
  bucket: blank(process.env.S3_BUCKET_NAME),
  region: blank(process.env.AWS_REGION) ?? 'ap-southeast-1',
  /** Optional. Leave both empty to use an IAM role / the default AWS credential chain. */
  accessKeyId: blank(process.env.AWS_ACCESS_KEY_ID),
  secretAccessKey: blank(process.env.AWS_SECRET_ACCESS_KEY),
  /** Optional CDN / custom domain (e.g. https://d123.cloudfront.net). Used to build image URLs. */
  publicBaseUrl: blank(process.env.S3_PUBLIC_BASE_URL),
  /** Optional S3-compatible service (MinIO, Cloudflare R2, DigitalOcean Spaces). */
  endpoint: blank(process.env.S3_ENDPOINT),
}));
