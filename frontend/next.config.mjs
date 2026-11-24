// Exportación estática: genera /out, lista para GitHub Pages (o S3 + CloudFront).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** @type {import('next').NextConfig} */
export default {
  output: 'export',
  trailingSlash: true,          // /carrito/ → carrito/index.html (funciona en Pages sin reglas extra)
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
};
