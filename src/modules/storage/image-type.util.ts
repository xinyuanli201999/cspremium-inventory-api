export interface DetectedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  ext: 'jpg' | 'png' | 'gif' | 'webp';
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identify an image from its first bytes. The browser-supplied Content-Type and
 * file name are user input and are never trusted. SVG is deliberately unsupported
 * (it can carry scripts).
 */
export function detectImageType(buf: Buffer): DetectedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG)) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
