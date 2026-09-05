import { Injectable } from '@nestjs/common';
import type { CepLookupResult } from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from '../redis/redis.service';
import { ApiException } from '../common/errors/api.exception';

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean | string;
}

const VIACEP_TIMEOUT_MS = 4_000;
/** CEP é dado estável: 30 dias de cache poupam a ViaCEP e o tempo do dono. */
const CACHE_TTL_SECONDS = 30 * 86_400;

/**
 * Consulta de CEP do passo 2 do onboarding.
 *
 * O protótipo chama a ViaCEP direto do navegador; aqui a chamada é da API. Três
 * motivos: o CSP das apps não precisa liberar um host externo, o resultado é
 * cacheado no Redis para todo mundo, e o dia em que a ViaCEP for trocada por
 * outro provedor nenhum frontend muda.
 */
@Injectable()
export class CepService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CepService.name);
  }

  async lookup(cep: string): Promise<CepLookupResult> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      throw ApiException.badRequest('Digite um CEP com 8 dígitos.');
    }

    const cached = await this.readCache(digits);
    if (cached) {
      return cached;
    }

    const data = await this.fetchViaCep(digits);
    if (!data || data.erro) {
      throw ApiException.notFound('CEP não encontrado.');
    }

    const result: CepLookupResult = {
      zip: digits,
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
      complement: data.complemento ?? '',
      // O código IBGE é o que permite ao passo 2 SELECIONAR a cidade no combo
      // sem casar por nome. A ViaCEP nem sempre o traz; vazio degrada para
      // seleção por nome normalizado, que é o melhor esforço possível.
      ibgeCode: data.ibge ?? '',
    };

    await this.writeCache(digits, result);
    return result;
  }

  private async fetchViaCep(cep: string): Promise<ViaCepResponse | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VIACEP_TIMEOUT_MS);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`ViaCEP respondeu ${response.status}`);
      }
      return (await response.json()) as ViaCepResponse;
    } catch (error) {
      // A tela do protótipo tem plano B: "Preencha manualmente". Um provedor
      // externo fora do ar não pode travar o onboarding.
      this.logger.warn({ err: (error as Error).message, cep }, 'consulta de CEP falhou');
      throw ApiException.badRequest(
        'Não foi possível buscar o CEP agora. Preencha o endereço manualmente.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readCache(cep: string): Promise<CepLookupResult | null> {
    try {
      const raw = await this.redis.client.get(this.key(cep));
      return raw ? (JSON.parse(raw) as CepLookupResult) : null;
    } catch {
      // Redis fora do ar degrada para consulta direta, não para erro.
      return null;
    }
  }

  private async writeCache(cep: string, result: CepLookupResult): Promise<void> {
    try {
      await this.redis.client.set(this.key(cep), JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* cache é otimização, não requisito */
    }
  }

  /**
   * `v2` porque o agente 30 acrescentou `ibgeCode` ao resultado: as entradas
   * gravadas antes não têm o campo, e servi-las do cache devolveria a cidade
   * sem o código que o passo 2 usa para selecioná-la. Versionar a chave é o
   * jeito de a mudança de contrato não conviver com 30 dias de cache velho.
   */
  private key(cep: string): string {
    return `bvp:cep:v2:${cep}`;
  }
}
