import { Injectable } from '@nestjs/common';
import { isValidSlug, slugify, SLUG_MIN_LENGTH, type SlugAvailability } from '@barbervp/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Slug da URL pública (`/{slug}`).
 *
 * Vale para os dois lados: o registro deriva o slug do nome da barbearia e o
 * passo 3 do onboarding deixa o dono editar. Regra idêntica ao protótipo —
 * minúsculas e `[a-z0-9-]` — implementada por `slugify` em `@barbervp/types`,
 * de onde o frontend também importa.
 */

/**
 * Slugs proibidos porque a URL já pertence a outra coisa.
 *
 * **Por que isto é bloqueio, e não estilo.** Desde a consolidação da fase 11 as
 * quatro superfícies vivem numa árvore de rotas só, e no Next a rota ESTÁTICA
 * ganha da dinâmica: uma barbearia com slug `cadastro` teria `/cadastro`
 * resolvido para a tela de cadastro e **nunca abriria**. Antes eram domínios
 * separados e o problema não existia — por isso a lista abaixo estava
 * desatualizada em relação às rotas que existem hoje.
 *
 * Os dois primeiros grupos saem das rotas REAIS de `apps/web`; conferir com:
 *
 *     find apps/web/app -name page.tsx -not -path '*(dashboard)*' -not -path '*(admin)*'
 *
 * Rota nova fora de `(dashboard)`/`(admin)` entra aqui no mesmo commit.
 */
const RESERVED_SLUGS = new Set([
  // Rotas estáticas de `apps/web` — as que de fato sequestrariam o slug.
  'agendar', // (booking)/agendar
  'entrar', // (marketing)/(auth)/entrar
  'cadastro', // (marketing)/(auth)/cadastro
  'recuperar-senha', // (marketing)/(auth)/recuperar-senha
  'privacidade', // (marketing)/(legal)/privacidade
  'termos', // (marketing)/(legal)/termos

  // Prefixos de superfície e arquivos servidos na raiz.
  'admin',
  'app',
  'api',
  'robots.txt',
  'sitemap.xml',

  // Defensivos: não são rota hoje, mas são candidatos óbvios a virarem uma, e
  // um slug já em uso é caro de trocar depois (o link está no story do dono).
  'auth',
  'booking',
  'cliente',
  'conta',
  'dashboard',
  'login',
  'painel',
  'planos',
  'precos',
  'sobre',
  'suporte',
  'www',
]);

/** Exposto para o teste que compara a lista com as rotas reais. */
export const RESERVED_SLUG_LIST: readonly string[] = [...RESERVED_SLUGS];

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
      // `reserved` separa os dois "indisponível" que a tela precisa distinguir:
      // este nunca vai ficar livre (a URL é de uma rota do produto), enquanto
      // `SLUG_IN_USE` é de outra barbearia. Sem a marca, o passo 3 dizia "já
      // está em uso" para `entrar`, `cadastro` e `admin` — e o dono ficava
      // esperando o dia em que a outra barbearia soltasse o nome.
      return {
        slug,
        available: false,
        reserved: RESERVED_SLUGS.has(slug),
        suggestion: await this.generateUnique(`${slug}-barbearia`),
      };
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
