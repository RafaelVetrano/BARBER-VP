import type { MetadataRoute } from 'next';

/** Superfície interna: nada aqui deve ser indexado (SPEC.md). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
