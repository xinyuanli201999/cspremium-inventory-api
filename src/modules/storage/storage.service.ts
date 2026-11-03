import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { detectImageType } from './image-type.util';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';

/**
 * Only keys WE generated can be deleted. Image URLs live in the database and an admin
 * can send any string through the API, so this keeps a crafted value such as
 * "/uploads/../../etc/passwd" from ever reaching a delete call.
 */
const MANAGED_KEY =
  /^(?:products\/\d{4}\/\d{2}\/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|gif|webp)$/;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  get driverName() {
    return this.driver.name;
  }

  /** Validate the file by content, store it, return its public URL. */
  async uploadImage(buffer: Buffer): Promise<{ url: string }> {
    const type = detectImageType(buffer);
    if (!type) {
      throw new BadRequestException('ឯកសារមិនមែនជារូបភាពត្រឹមត្រូវទេ (អនុញ្ញាត JPG, PNG, WEBP, GIF)');
    }

    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `products/${now.getUTCFullYear()}/${month}/${randomUUID()}.${type.ext}`;

    try {
      return { url: await this.driver.put(key, buffer, type.mime) };
    } catch (err) {
      this.logger.error(
        `Image upload failed (${this.driver.name}): ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new BadGatewayException('មិនអាចរក្សាទុករូបភាពបានទេ សូមព្យាយាមម្តងទៀត');
    }
  }

  /** Best effort: a failed clean-up must never fail the request that triggered it. */
  async deleteByUrl(url?: string | null): Promise<void> {
    if (!url) return;
    const key = this.driver.keyFromUrl(url);
    if (!key || !MANAGED_KEY.test(key)) return;
    try {
      await this.driver.remove(key);
    } catch (err) {
      this.logger.warn(`Could not delete image ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
