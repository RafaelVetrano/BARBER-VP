import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicSaasPlan } from '@barbervp/types';
import { Public, TenantOptional } from '../common/decorators/public.decorator';
import { PublicPlansService } from './public-plans.service';

/**
 * Catálogo público de planos do SaaS — o que a landing de vendas mostra.
 *
 * `@TenantOptional()` é obrigatório aqui: sem ele o `TenantGuard` global exige
 * um tenant resolvido e devolve 403 TENANT_REQUIRED. Esta rota é a única de
 * `/public` que não fala de uma barbearia específica — ela fala do produto.
 *
 * ATENÇÃO à ordem de registro no `AppModule`: `PublicBookingController` é
 * `@Controller('public/:slug')` e tem um `@Get()` na raiz, então
 * `/public/saas-plans` casaria com ele como `slug = "saas-plans"`. Quem casa
 * primeiro é quem foi registrado primeiro — este módulo entra ANTES do
 * `BookingModule`, e o e2e cobre exatamente isso para a ordem não se perder
 * numa reorganização futura.
 */
@ApiTags('public')
@Public()
@TenantOptional()
@Controller('public/saas-plans')
export class PublicPlansController {
  constructor(private readonly plans: PublicPlansService) {}

  /**
   * Resposta idêntica para todo mundo e sem dado de sessão — pode ser cacheada
   * na borda. Cinco minutos no CDN com meia hora de `stale-while-revalidate`: a
   * landing tem ISR de uma hora por cima disso, então mudança de preço no admin
   * aparece no pior caso na próxima revalidação, sem deploy.
   */
  @Get()
  @Header('cache-control', 'public, max-age=300, stale-while-revalidate=1800')
  @ApiOperation({ summary: 'Planos do SaaS exibidos na landing de vendas' })
  list(): Promise<PublicSaasPlan[]> {
    return this.plans.list();
  }
}
