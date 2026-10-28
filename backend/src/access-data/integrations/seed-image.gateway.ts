const SOURCE_HOSTS = new Set(['picsum.photos', 'fastly.picsum.photos', 'images.unsplash.com']);

export function isAllowedImageSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && SOURCE_HOSTS.has(url.hostname)
      && !url.username && !url.password && (!url.port || url.port === '443');
  } catch { return false; }
}

export async function readSeedImageBytes(source: string, maxBytes: number, request: typeof fetch = fetch) {
  let url = source;
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isAllowedImageSource(url)) throw new Error('Origen de imagen no permitido');
    const response = await request(url, {
      redirect: 'manual', signal, headers: { Accept: 'image/jpeg,image/png,image/webp' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirección sin destino');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('No se pudo descargar la imagen');
    }
    if (Number(response.headers.get('content-length') || 0) > maxBytes) {
      await response.body.cancel();
      throw new Error('Imagen demasiado grande');
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes) throw new Error('Imagen demasiado grande');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return { content: Buffer.concat(chunks), contentType };
  }
  throw new Error('Demasiadas redirecciones');
}
