import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { StorageDriver } from '../storage.types';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
const URL_PREFIX = '/uploads/';

/** Development fallback: files on local disk, served by the API under /uploads. */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  constructor(private readonly dir: string = UPLOAD_DIR) {}

  async put(key: string, body: Buffer): Promise<string> {
    const target = this.resolveInside(key);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return `${URL_PREFIX}${key}`;
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolveInside(key), { force: true });
  }

  keyFromUrl(url: string): string | null {
    return url.startsWith(URL_PREFIX) ? url.slice(URL_PREFIX.length) : null;
  }

  /** Defence in depth: never touch a path outside the uploads folder. */
  private resolveInside(key: string): string {
    const root = resolve(this.dir);
    const target = resolve(root, key);
    if (!target.startsWith(root + sep)) throw new Error(`Refusing path outside uploads: ${key}`);
    return target;
  }
}
