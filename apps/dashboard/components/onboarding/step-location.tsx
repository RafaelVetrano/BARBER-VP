'use client';

import { useState } from 'react';
import type { OnboardingLocation } from '@barbervp/types';
import {
  AlertCircleIcon,
  Button,
  CheckCircleIcon,
  Input,
  authErrorMessage,
  maskCepInput,
  onboardingApi,
  useEstablishmentAuth,
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
 */
export function StepLocation({ value, onChange }: StepLocationProps) {
  const { client } = useEstablishmentAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  const patch = (partial: Partial<OnboardingLocation>) => onChange({ ...value, ...partial });

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
        complement: value.complement || address.complement || null,
      });
      setFound(true);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível buscar o CEP. Preencha manualmente.'));
    } finally {
      setLoading(false);
    }
  };

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

      <div className="flex flex-col gap-4 sm:flex-row">
        <Input
          label="Bairro"
          value={value.neighborhood ?? ''}
          onChange={(event) => patch({ neighborhood: event.target.value })}
          className="flex-1"
        />
        <Input
          label="Cidade"
          value={value.city ?? ''}
          onChange={(event) => patch({ city: event.target.value })}
          required
          className="flex-1"
        />
        <Input
          label="UF"
          value={value.state ?? ''}
          onChange={(event) => patch({ state: event.target.value.toUpperCase().slice(0, 2) })}
          placeholder="UF"
          maxLength={2}
          required
          className="sm:w-24"
        />
      </div>
    </div>
  );
}
