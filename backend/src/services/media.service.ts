import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { ImageObject, readImage, storeImage, StoredImage } from '../repositories/media.repository';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class InvalidImageError extends Error {}

const IMAGE_FILENAME = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|imported-[0-9a-f]{64})\.(jpg|png|webp)$/;

export async function getImage(filename: string,
  read: (key: string) => Promise<StoredImage | null> = readImage) {
  const match = IMAGE_FILENAME.exec(filename);
  if (!match) return null;
  const image = await read(`images/${filename}`);
  if (!image) return null;
  const expectedType = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`;
  if (image.contentType !== expectedType || !image.contentLength
    || image.contentLength < 1 || image.contentLength > MAX_IMAGE_BYTES) {
    image.body.destroy();
    return null;
  }
  return { ...image, contentType: expectedType, contentLength: image.contentLength };
}

export function imageSizeGuard(expectedLength: number) {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expectedLength || received > MAX_IMAGE_BYTES) callback(new Error('Invalid image size'));
      else callback(null, chunk);
    },
    flush(callback) {
      callback(received === expectedLength ? undefined : new Error('Incomplete image'));
    },
  });
}

export function imageExtension(content: Buffer, contentType: string): string {
  if (content.length === 0 || content.length > MAX_IMAGE_BYTES) {
    throw new InvalidImageError('La imagen debe tener contenido y pesar como máximo 5 MB.');
  }
  if (contentType === 'image/jpeg' && content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'jpg';
  if (contentType === 'image/png' && content.length >= 16
    && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && content.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (contentType === 'image/webp' && content.length >= 16
    && content.toString('ascii', 0, 4) === 'RIFF'
    && content.toString('ascii', 8, 12) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(content.toString('ascii', 12, 16))) return 'webp';
  throw new InvalidImageError('El archivo no es una imagen JPEG, PNG o WebP válida.');
}

export async function uploadImage(content: Buffer, contentType: string,
  save: (input: ImageObject) => Promise<string> = storeImage) {
  const extension = imageExtension(content, contentType);
  const key = `images/${randomUUID()}.${extension}`;
  const url = await save({ key, content, contentType });
  return { key, url };
}
