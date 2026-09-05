import { Injectable } from '@nestjs/common';
import { BRAZIL_UFS, isValidUf, type IbgeCity } from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../redis/redis.service';
import { ApiException } from '../common/errors/api.exception';

interface IbgeMunicipality {
  id?: number | string;
  nome?: string;
}

const IBGE_TIMEOUT_MS = 6_000;
/**
 * Município é dado mais estável ainda que CEP — a última criação de município
 * no Brasil é de 2013. 30 dias é o mesmo TTL do CEP, pelo mesmo motivo: uma UF
 * consultada por um dono serve todos os outros.
 */
const CACHE_TTL_SECONDS = 30 * 86_400;

/**
 * Municípios do passo 2 do onboarding, por UF.
 *
 * Segue o padrão que a fase 03 fixou para a ViaCEP e pelas MESMAS três razões:
 * o CSP das apps não precisa liberar `servicodados.ibge.gov.br`, o resultado é
 * cacheado no Redis para toda a base, e trocar de fonte não toca frontend.
 *
 * Os 5.570 municípios NÃO entram no bundle: seriam ~150 kB carregados por todo
 * dono para escolher um item. A UF, essa sim, é lista estática
 * (`BRAZIL_UFS`) — são 27 itens que não mudam.
 *
 * Se o IBGE estiver fora, `list` devolve lista VAZIA em vez de erro: o passo 2
 * degrada para cidade digitada à mão, como o CEP já degrada. Um provedor
 * externo fora do ar não pode travar o onboarding — e desde o agente 30 o
 * onboarding é obrigatório, então travá-lo seria travar o produto inteiro.
 */
@Injectable()
export class CitiesService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CitiesService.name);
  }

  /** As 27 UFs, sem chamada externa. */
  listUfs(): typeof BRAZIL_UFS {
    return BRAZIL_UFS;
  }

  async list(uf: string): Promise<IbgeCity[]> {
    const code = (uf ?? '').trim().toUpperCase();
    if (!isValidUf(code)) {
      throw ApiException.badRequest('UF inválida — use a sigla de 2 letras (ex.: SP).');
    }

    const cached = await this.readCache(code);
    if (cached) {
      return cached;
    }

    const cities = await this.fetchIbge(code);
    if (cities.length === 0) {
      // Sem gravar cache: um IBGE fora do ar não pode deixar 30 dias de lista
      // vazia para todo mundo.
      return [];
    }

    await this.writeCache(code, cities);
    return cities;
  }

  private async fetchIbge(uf: string): Promise<IbgeCity[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IBGE_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
        { signal: controller.signal, headers: { accept: 'application/json' } },
      );
      if (!response.ok) {
        throw new Error(`IBGE respondeu ${response.status}`);
      }

      const payload = (await response.json()) as IbgeMunicipality[];
      return payload
        .filter((item): item is Required<IbgeMunicipality> => Boolean(item?.id && item?.nome))
        .map((item) => ({ id: String(item.id), name: String(item.nome) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (error) {
      this.logger.warn({ err: (error as Error).message, uf }, 'consulta de municípios falhou');
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCache(uf: string): Promise<IbgeCity[] | null> {
    try {
      const raw = await this.redis.client.get(this.key(uf));
      return raw ? (JSON.parse(raw) as IbgeCity[]) : null;
    } catch {
      // Redis fora do ar degrada para consulta direta, não para erro.
      return null;
    }
  }

  private async writeCache(uf: string, cities: IbgeCity[]): Promise<void> {
    try {
      await this.redis.client.set(this.key(uf), JSON.stringify(cities), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* cache é otimização, não requisito */
    }
  }

  private key(uf: string): string {
    return `bvp:ibge:municipios:${uf}`;
  }
}
