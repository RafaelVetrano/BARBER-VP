import { Injectable } from '@nestjs/common';
import { isValidSlug, slugify, SLUG_MIN_LENGTH, type SlugAvailability } from '@barbervp/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Slug da URL pública (`/agendar/{slug}`).
 *
 * Vale para os dois lados: o registro deriva o slug do nome da barbearia e o
 * passo 3 do onboarding deixa o dono editar. Regra idêntica ao protótipo —
 * minúsculas e `[a-z0-9-]` — implementada por `slugify` em `@barbervp/types`,
 * de onde o frontend também importa.
 *
 * Reservados: rotas que a app de booking já usa e não podem virar barbearia.
 */
const RESERVED_SLUGS = new Set([
  'admin',
  'agendar',
  'api',
  'app',
  'auth',
  'booking',
  'cliente',
  'conta',
  'dashboard',
  'entrar',
  'login',
  'painel',
  'sobre',
  'suporte',
  'termos',
  'www',
]);

@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normaliza uma entrada livre. Nomes curtíssimos ganham um sufixo estável. */
  normalize(input: string): string {
    const slug = slugify(input);
    return slug.length >= SLUG_MIN_LENGTH ? slug : `${slug || 'barbearia'}-bvp`.slice(0, 63);
  }

  /**
   * Slug livre a partir do nome da barbearia: `Studio Navalha` →
   * `studio-navalha`, `studio-navalha-2`, `studio-navalha-3`…
   *
   * Roda dentro da transação de registro, então usa o client transacional; a
   * corrida remanescente (dois registros simultâneos com o mesmo nome) é pega
   * pela `UNIQUE` do banco, que vira 409 no filtro global.
   */
  async generateUnique(name: string, tx: Prisma.TransactionClient = this.prisma): Promise<string> {
    const base = this.normalize(name);

    for (let suffix = 0; suffix < 50; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      if (await this.isFree(candidate, tx)) {
        return candidate;
      }
    }

    // Fallback improvável: 50 homônimos. Cai num sufixo aleatório curto.
    return `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async checkAvailability(input: string, currentTenantId?: string): Promise<SlugAvailability> {
    const slug = this.normalize(input);

    if (!isValidSlug(slug) || RESERVED_SLUGS.has(slug)) {
      return { slug, available: false, suggestion: await this.generateUnique(`${slug}-barbearia`) };
    }

    const owner = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!owner || owner.id === currentTenantId) {
      return { slug, available: true };
    }

    return { slug, available: false, suggestion: await this.generateUnique(slug) };
  }

  private async isFree(slug: string, tx: Prisma.TransactionClient): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug)) {
      return false;
    }
    const existing = await tx.tenant.findUnique({ where: { slug }, select: { id: true } });
    return existing === null;
  }
}
