export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface StorageDriver {
  readonly name: 's3' | 'local';
  /** Store the bytes under `key` and return the public URL to save in the database. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
  /** The key of a URL this driver produced, or null for anything else. */
  keyFromUrl(url: string): string | null;
}
