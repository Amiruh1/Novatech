import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export interface ImageObject {
  key: string;
  content: Buffer;
  contentType: string;
}

let client: S3Client | undefined;

function storage() {
  const bucket = process.env.MEDIA_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) throw new Error('Media storage is not configured');
  client ??= new S3Client({ region, maxAttempts: 3 });
  return { bucket, client };
}

export interface StoredImage {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
}

export async function readImage(key: string): Promise<StoredImage | null> {
  const { bucket, client } = storage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!(result.Body instanceof Readable)) throw new Error('Image body is unavailable');
    return { body: result.Body, contentType: result.ContentType, contentLength: result.ContentLength, etag: result.ETag };
  } catch (error) {
    if ((error as { name?: string }).name === 'NoSuchKey'
      || [403, 404].includes((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode || 0)) return null;
    throw error;
  }
}

export async function storeImage(input: ImageObject): Promise<string> {
  const { bucket, client } = storage();
  const baseUrl = process.env.MEDIA_BASE_URL;
  if (!baseUrl) throw new Error('Media storage is not configured');
  const publicBase = new URL(baseUrl);
  if (publicBase.protocol !== 'https:' || publicBase.username || publicBase.password || publicBase.search || publicBase.hash) {
    throw new Error('Invalid media base URL');
  }

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.content,
    ContentType: input.contentType,
    ContentLength: input.content.length,
    CacheControl: 'public, max-age=31536000, immutable',
  }), { abortSignal: AbortSignal.timeout(30000) });

  return `${baseUrl.replace(/\/$/, '')}/${input.key}`;
}
