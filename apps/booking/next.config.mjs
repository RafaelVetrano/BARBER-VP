import { fileURLToPath } from 'node:url';
import path from 'node:path';

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `packages/ui` é publicado como fonte TS/TSX — o Next compila junto.
  transpilePackages: ['@barbervp/ui', '@barbervp/types'],
  // Imagem de produção enxuta (Dockerfile multi-stage copia só o standalone).
  output: 'standalone',
  // Sem isto o tracing do standalone para no diretório da app e deixa de fora
  // os pacotes do workspace instalados na raiz do monorepo.
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
