'use client';

import { useEffect, useState } from 'react';
import { normalizeSearchText, type IbgeCity, type OnboardingLocation } from '@barbervp/types';
import {
  AlertCircleIcon,
  Button,
  CheckCircleIcon,
  Combobox,
  Input,
  authErrorMessage,
  maskCepInput,
  onboardingApi,
  useEstablishmentAuth,
  type ComboboxOption,
} from '@barbervp/ui';

export interface StepLocationProps {
  value: OnboardingLocation;
  onChange: (next: OnboardingLocation) => void;
}

/**
 * Passo 2 — localização, com autopreenchimento por CEP.
 *
 * O protótipo chama a ViaCEP direto do navegador; aqui a consulta passa pela
 * API (`GET /onboarding/cep/:cep`), que cacheia no Redis e isola o provedor.
 * O comportamento visto pelo dono é o mesmo, inclusive o plano B: se a busca
 * falhar, o endereço continua editável à mão.
 *
 * **Cidade e UF são seletores com busca desde o agente 30.** Eram texto livre
 * preenchido pela ViaCEP, o que aceitava "São Paulo", "Sao Paulo", "sp" e
 * "S. Paulo" como quatro cidades diferentes. A UF vem de lista estática (27
 * itens, `@barbervp/types`); a cidade, do IBGE via
 * `GET /onboarding/cities/:uf`, com cache no Redis pelo mesmo motivo do CEP.
 *
 * Degradação: se o IBGE não responde, a lista chega vazia e a cidade volta a
 * ser campo de texto, com aviso. Um provedor externo fora do ar não pode
 * travar um passo obrigatório.
 */
export function StepLocation({ value, onChange }: StepLocationProps) {
  const { client } = useEstablishmentAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  const [ufs, setUfs] = useState<ComboboxOption[]>([]);
  const [cities, setCities] = useState<IbgeCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesFailed, setCitiesFailed] = useState(false);

  const patch = (partial: Partial<OnboardingLocation>) => onChange({ ...value, ...partial });

  useEffect(() => {
    let cancelled = false;
    void onboardingApi
      .listUfs(client)
      .then((list) => {
        if (cancelled) return;
        setUfs(list.map((uf) => ({ value: uf.code, label: uf.name, keywords: uf.code })));
      })
      .catch(() => {
        /* A UF cai para o `Input` do ramo de degradação, como a cidade. */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const uf = value.state ?? '';

  useEffect(() => {
    if (!uf) {
      setCities([]);
      setCitiesFailed(false);
      return;
    }

    let cancelled = false;
    setCitiesLoading(true);
    setCitiesFailed(false);
    void onboardingApi
      .listCities(client, uf)
      .then((list) => {
        if (cancelled) return;
        setCities(list);
        // Lista vazia É a degradação combinada com a API: o IBGE não respondeu.
        setCitiesFailed(list.length === 0);
      })
      .catch(() => {
        if (cancelled) return;
        setCities([]);
        setCitiesFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, uf]);

  const lookup = async () => {
    const digits = (value.zip ?? '').replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('Digite um CEP com 8 dígitos.');
      setFound(false);
      return;
    }

    setLoading(true);
    setError(null);
    setFound(false);
    try {
      const address = await onboardingApi.lookupCep(client, digits);
      onChange({
        ...value,
        zip: digits,
        street: address.street || value.street,
        neighborhood: address.neighborhood || value.neighborhood,
        city: address.city || value.city,
        state: address.state || value.state,
        // O código IBGE é o que SELECIONA a cidade no combo assim que a lista
        // da UF chega — casar por nome erraria em cada divergência de acento.
        cityIbgeCode: address.ibgeCode || null,
        complement: value.complement || address.complement || null,
      });
      setFound(true);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível buscar o CEP. Preencha manualmente.'));
    } finally {
      setLoading(false);
    }
  };

  const cityOptions: ComboboxOption[] = cities.map((city) => ({
    value: city.id,
    label: city.name,
  }));

  /**
   * O CEP devolve nome e código; a lista da cidade chega depois. Este casamento
   * fecha o ciclo: com o código, a seleção é exata; sem ele (a ViaCEP nem sempre
   * o traz), cai no nome normalizado, que é o melhor esforço possível.
   */
  const selectedCityId =
    cities.find((city) => city.id === value.cityIbgeCode)?.id ??
    cities.find((city) => normalizeSearchText(city.name) === normalizeSearchText(value.city ?? ''))
      ?.id ??
    null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2.5">
          <Input
            label="CEP"
            inputMode="numeric"
            value={value.zip ? maskCepInput(value.zip) : ''}
            onChange={(event) => {
              patch({ zip: event.target.value.replace(/\D/g, '').slice(0, 8) });
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void lookup();
              }
            }}
            placeholder="00000-000"
            maxLength={9}
            className="w-full sm:w-44"
          />
          <Button
            variant="outline"
            onClick={() => void lookup()}
            loading={loading}
            loadingText="Buscando…"
            className="w-full sm:w-auto"
          >
            Buscar CEP
          </Button>
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
            <AlertCircleIcon size={14} /> {error}
          </p>
        )}
        {found && !error && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
            <CheckCircleIcon size={16} /> Endereço encontrado
          </p>
        )}
      </div>

      <Input
        label="Endereço (rua / logradouro)"
        value={value.street ?? ''}
        onChange={(event) => patch({ street: event.target.value })}
        placeholder="Rua, avenida…"
        hint={found ? 'Preenchido pelo CEP. Você pode editar se necessário.' : undefined}
        required
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        <Input
          label="Número"
          value={value.number ?? ''}
          onChange={(event) => patch({ number: event.target.value })}
          placeholder="Nº"
          required
          className="sm:w-32"
        />
        <Input
          label="Complemento (opcional)"
          value={value.complement ?? ''}
          onChange={(event) => patch({ complement: event.target.value })}
          placeholder="Sala, andar…"
          className="flex-1"
        />
      </div>

      <Input
        label="Bairro"
        value={value.neighborhood ?? ''}
        onChange={(event) => patch({ neighborhood: event.target.value })}
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        {ufs.length > 0 ? (
          <Combobox
            label="Estado"
            required
            options={ufs}
            value={uf || null}
            // Trocar a UF limpa a cidade: São Paulo/SP e São Paulo/MG não são a
            // mesma coisa, e manter o nome antigo com a sigla nova gravaria um
            // endereço que não existe.
            onChange={(next) => patch({ state: next, city: null, cityIbgeCode: null })}
            placeholder="Escolha o estado"
            searchPlaceholder="Buscar por nome ou sigla"
            emptyMessage="Nenhum estado com esse nome."
            className="sm:w-64"
          />
        ) : (
          <Input
            label="UF"
            value={uf}
            onChange={(event) =>
              patch({ state: event.target.value.toUpperCase().slice(0, 2), city: null, cityIbgeCode: null })
            }
            placeholder="UF"
            maxLength={2}
            required
            className="sm:w-24"
          />
        )}

        {/* Dois ramos de render, não um `disabled`: sem UF não existe lista de
            cidade para oferecer, e um controle apagado não diz o que falta. */}
        {!uf ? (
          <div className="flex flex-1 flex-col justify-end gap-1.5">
            <span className="text-[13px] text-fg-muted">Cidade</span>
            <p className="flex min-h-12 items-center rounded-control border border-dashed border-border bg-surface px-3.5 text-[13px] text-fg-subtle">
              Escolha o estado primeiro.
            </p>
          </div>
        ) : citiesFailed ? (
          <Input
            label="Cidade"
            value={value.city ?? ''}
            onChange={(event) => patch({ city: event.target.value, cityIbgeCode: null })}
            hint="Não conseguimos carregar a lista de cidades agora — digite o nome."
            required
            className="flex-1"
          />
        ) : (
          <Combobox
            label="Cidade"
            required
            options={cityOptions}
            value={selectedCityId}
            onChange={(next) => {
              const city = cities.find((item) => item.id === next);
              patch({ city: city?.name ?? null, cityIbgeCode: city?.id ?? null });
            }}
            placeholder={citiesLoading ? 'Carregando cidades…' : 'Escolha a cidade'}
            searchPlaceholder="Buscar cidade"
            emptyMessage={citiesLoading ? 'Carregando…' : 'Nenhuma cidade com esse nome.'}
            className="flex-1"
          />
        )}
      </div>
    </div>
  );
}
