import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageDriver } from './drivers/local.driver';
import { S3StorageDriver } from './drivers/s3.driver';
import { detectImageType } from './image-type.util';
import { StorageService } from './storage.service';
import { StorageDriver } from './storage.types';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const GIF = Buffer.from('GIF89a......');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const UUID = '0b9f6f3e-2a41-4c2b-9a53-6d2f2f1c7a10';

describe('detectImageType', () => {
  it.each([
    ['jpeg', JPEG, 'image/jpeg', 'jpg'],
    ['png', PNG, 'image/png', 'png'],
    ['gif', GIF, 'image/gif', 'gif'],
    ['webp', WEBP, 'image/webp', 'webp'],
  ])('recognises %s by its bytes', (_n, buf, mime, ext) => {
    expect(detectImageType(buf)).toEqual({ mime, ext });
  });

  it('rejects text, scripts, SVG and empty input even if named like an image', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('S3StorageDriver', () => {
  const make = (extra = {}) => {
    const send = jest.fn().mockResolvedValue({});
    const driver = new S3StorageDriver({ client: { send } as never, bucket: 'my-bucket', region: 'ap-southeast-1', ...extra });
    return { send, driver };
  };

  it('uploads with content type, long cache and no ACL, and returns the S3 URL', async () => {
    const { send, driver } = make();
    const url = await driver.put('products/2026/10/a.jpg', JPEG, 'image/jpeg');

    expect(url).toBe('https://my-bucket.s3.ap-southeast-1.amazonaws.com/products/2026/10/a.jpg');
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'products/2026/10/a.jpg',
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(cmd.input).not.toHaveProperty('ACL');
  });

  it('builds URLs on the CDN domain when S3_PUBLIC_BASE_URL is set (trailing slash ignored)', async () => {
    const { driver } = make({ publicBaseUrl: 'https://cdn.example.com/' });
    expect(await driver.put('products/x.png', PNG, 'image/png')).toBe('https://cdn.example.com/products/x.png');
    expect(driver.keyFromUrl('https://cdn.example.com/products/x.png')).toBe('products/x.png');
  });

  it('uses path-style URLs for S3-compatible endpoints', async () => {
    const { driver } = make({ endpoint: 'http://localhost:9000' });
    expect(await driver.put('k.png', PNG, 'image/png')).toBe('http://localhost:9000/my-bucket/k.png');
  });

  it('deletes by key and ignores URLs it did not create', async () => {
    const { send, driver } = make();
    await driver.remove('products/a.jpg');
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0][0] as DeleteObjectCommand).input).toEqual({ Bucket: 'my-bucket', Key: 'products/a.jpg' });
    expect(driver.keyFromUrl('https://evil.example.com/products/a.jpg')).toBeNull();
    expect(driver.keyFromUrl('/uploads/a.jpg')).toBeNull();
  });
});

describe('LocalStorageDriver', () => {
  it('writes inside its folder and refuses paths that escape it', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'uploads-'));
    const driver = new LocalStorageDriver(dir);

    const url = await driver.put('products/2026/10/a.jpg', JPEG);
    expect(url).toBe('/uploads/products/2026/10/a.jpg');
    expect((await fs.readFile(join(dir, 'products/2026/10/a.jpg'))).equals(JPEG)).toBe(true);

    await driver.remove('products/2026/10/a.jpg');
    await expect(fs.access(join(dir, 'products/2026/10/a.jpg'))).rejects.toThrow();

    await expect(driver.put('../escape.jpg', JPEG)).rejects.toThrow(/outside uploads/);
    await expect(driver.remove('../../etc/passwd')).rejects.toThrow(/outside uploads/);
  });
});

describe('StorageService', () => {
  const fakeDriver = (): jest.Mocked<StorageDriver> => ({
    name: 's3',
    put: jest.fn().mockResolvedValue('https://cdn.test/products/x.jpg'),
    remove: jest.fn().mockResolvedValue(undefined),
    keyFromUrl: jest.fn((url: string) => (url.startsWith('https://cdn.test/') ? url.slice('https://cdn.test/'.length) : url.startsWith('/uploads/') ? url.slice(9) : null)),
  });

  it('stores a valid image under products/yyyy/mm/<uuid>.<ext> using the detected type, not the client type', async () => {
    const driver = fakeDriver();
    const result = await new StorageService(driver).uploadImage(PNG);

    expect(result.url).toBe('https://cdn.test/products/x.jpg');
    const [key, body, contentType] = driver.put.mock.calls[0];
    expect(key).toMatch(/^products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(contentType).toBe('image/png');
    expect(body).toBe(PNG);
  });

  it('rejects non-images before touching storage', async () => {
    const driver = fakeDriver();
    await expect(new StorageService(driver).uploadImage(Buffer.from('<script>alert(1)</script>'))).rejects.toBeInstanceOf(BadRequestException);
    expect(driver.put).not.toHaveBeenCalled();
  });

  it('turns storage failures into a 502 without leaking details', async () => {
    const driver = fakeDriver();
    driver.put.mockRejectedValue(new Error('AccessDenied: arn:aws:iam::123:user/secret'));
    const err = await new StorageService(driver).uploadImage(JPEG).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(err.getResponse())).not.toContain('arn:aws');
  });

  it('deletes only keys it generated (new S3 layout and legacy flat local names)', async () => {
    const driver = fakeDriver();
    const svc = new StorageService(driver);

    await svc.deleteByUrl(`https://cdn.test/products/2026/10/${UUID}.jpg`);
    await svc.deleteByUrl(`/uploads/${UUID}.webp`);
    expect(driver.remove.mock.calls.map((c) => c[0])).toEqual([`products/2026/10/${UUID}.jpg`, `${UUID}.webp`]);
  });

  it('never deletes crafted, foreign or empty values', async () => {
    const driver = fakeDriver();
    const svc = new StorageService(driver);
    for (const bad of [
      '/uploads/../../etc/passwd',
      '/uploads/..%2f..%2fetc%2fpasswd',
      'https://cdn.test/products/../secrets.txt',
      'https://cdn.test/other-folder/file.jpg',
      'https://evil.example.com/products/2026/10/' + UUID + '.jpg',
      `/uploads/${UUID}.php`,
      '',
      null,
      undefined,
    ]) {
      await svc.deleteByUrl(bad);
    }
    expect(driver.remove).not.toHaveBeenCalled();
  });

  it('swallows delete failures so the product request still succeeds', async () => {
    const driver = fakeDriver();
    driver.remove.mockRejectedValue(new Error('network down'));
    await expect(new StorageService(driver).deleteByUrl(`/uploads/${UUID}.jpg`)).resolves.toBeUndefined();
  });
});
