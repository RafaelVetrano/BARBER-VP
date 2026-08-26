'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  MinusIcon,
  PlusIcon,
  Switch,
  Textarea,
  centsToInput,
  cn,
  inputToCents,
  useFieldIds,
  useToast,
} from '@barbervp/ui';
import { SERVICE_COLORS } from '@barbervp/types';
import type { BarberListItem, ServiceListItem } from '@barbervp/types';
import { useSaveServiceMutation } from '@/lib/dashboard/api/catalog';

/** Passo do stepper de duração — `± 5` do protótipo (l.6458). */
const DURATION_STEP = 5;
const DURATION_MIN = 5;
const DURATION_MAX = 480;

/**
 * Modal "Novo serviço" / "Editar serviço" (`Dashboard.dc.html` l.1949–2016).
 *
 * Dois campos do desenho ganharam significado aqui, porque no protótipo eles
 * não tinham nenhum:
 *
 * - **Comissão padrão** era um `input` por serviço que ninguém salvava, e
 *   abria em 40% para todos. Vira a comissão que a barbearia já configurou em
 *   Comissões, mostrada em modo leitura — é herança, não um segundo lugar de
 *   editar a mesma coisa. Quem quiser mudar o padrão muda a REGRA, num lugar
 *   só.
 * - **Comissão específica (opcional)** era um toggle que revelava um campo e
 *   descartava o valor. Agora é o `Service.commissionBps`: ligado, este
 *   serviço paga o percentual próprio no fechamento da comanda.
 */
export function ServiceModal({
  open,
  onClose,
  service,
  barbers,
  defaultCommissionBps,
}: {
  open: boolean;
  onClose: () => void;
  service: ServiceListItem | null;
  barbers: BarberListItem[];
  /** `CommissionRule.percentBps` da casa — o que o serviço herda. */
  defaultCommissionBps: number;
}) {
  const { toast } = useToast();
  const save = useSaveServiceMutation();
  const barberFieldIds = useFieldIds();
  const colorFieldIds = useFieldIds();
  const durationFieldIds = useFieldIds();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [priceInput, setPriceInput] = useState('0,00');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState<string>(SERVICE_COLORS[0]);
  const [ownCommissionOn, setOwnCommissionOn] = useState(false);
  const [ownCommission, setOwnCommission] = useState('');
  const [barberIds, setBarberIds] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setDescription(service?.description ?? '');
    setDurationMin(service?.durationMin ?? 30);
    setPriceInput(centsToInput(service?.priceCents ?? 0));
    setCategory(service?.category ?? '');
    setColor(service?.color ?? SERVICE_COLORS[0]);
    setOwnCommissionOn(service?.commissionBps != null);
    setOwnCommission(service?.commissionBps != null ? String(service.commissionBps / 100) : '');
    setBarberIds(service?.barberIds ?? barbers.map((barber) => barber.id));
    setNameError(null);
  }, [open, service, barbers]);

  const toggleBarber = (id: string) => {
    setBarberIds((current) => (current.includes(id) ? current.filter((b) => b !== id) : [...current, id]));
  };

  const stepDuration = (delta: number) =>
    setDurationMin((current) => Math.min(DURATION_MAX, Math.max(DURATION_MIN, current + delta)));

  const parsedCommission = Number(ownCommission.replace(',', '.'));
  const commissionInvalid =
    ownCommissionOn && (!Number.isFinite(parsedCommission) || parsedCommission < 0 || parsedCommission > 100);

  const submit = async () => {
    if (!name.trim()) {
      setNameError('Informe o nome do serviço.');
      return;
    }
    if (commissionInvalid) return;

    try {
      await save.mutateAsync({
        id: service?.id,
        dto: {
          name: name.trim(),
          description: description.trim() || null,
          durationMin,
          priceCents: inputToCents(priceInput),
          category: category.trim() || null,
          color,
          commissionBps: ownCommissionOn ? Math.round(parsedCommission * 100) : null,
          barberIds,
        },
      });
      toast({ message: service ? 'Serviço atualizado.' : 'Serviço criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? 'Editar serviço' : 'Novo serviço'}
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            Salvar serviço
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nome"
          required
          value={name}
          error={nameError ?? undefined}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
        />

        {/* Stepper de duração — o desenho não usa `<input type=number>`: o
            dono ajusta de 5 em 5, que é a granularidade da grade da agenda. */}
        <Field label="Duração" ids={durationFieldIds}>
          <div className="flex items-center gap-3">
            <IconButton
              aria-label="Diminuir 5 minutos"
              variant="outline"
              onClick={() => stepDuration(-DURATION_STEP)}
              disabled={durationMin <= DURATION_MIN}
            >
              <MinusIcon size={16} />
            </IconButton>
            <output className="w-20 text-center font-semibold tabular-nums text-fg" aria-live="polite">
              {durationMin} min
            </output>
            <IconButton
              aria-label="Aumentar 5 minutos"
              variant="outline"
              onClick={() => stepDuration(DURATION_STEP)}
              disabled={durationMin >= DURATION_MAX}
            >
              <PlusIcon size={16} />
            </IconButton>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Preço"
            inputMode="decimal"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
          />
          <Input
            label="Comissão padrão"
            readOnly
            value={`${(defaultCommissionBps / 100).toLocaleString('pt-BR')}%`}
            hint="Vem da regra de comissão da barbearia."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Switch
            label="Comissão específica (opcional)"
            description="Este serviço paga um percentual próprio, ignorando a regra."
            checked={ownCommissionOn}
            onChange={(event) => setOwnCommissionOn(event.target.checked)}
          />
          {ownCommissionOn && (
            <Input
              label="Percentual deste serviço"
              inputMode="decimal"
              placeholder="%"
              value={ownCommission}
              error={commissionInvalid ? 'Informe um percentual entre 0 e 100.' : undefined}
              onChange={(event) => setOwnCommission(event.target.value)}
            />
          )}
        </div>

        <Field label="Cor na agenda" ids={colorFieldIds}>
          <div role="radiogroup" aria-label="Cor na agenda" className="flex flex-wrap gap-2.5">
            {SERVICE_COLORS.map((swatch) => {
              const selected = color === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Cor ${swatch}`}
                  onClick={() => setColor(swatch)}
                  // 44px de alvo de toque com a bolinha de 26px desenhada
                  // dentro: no protótipo o alvo É a bolinha, e no celular isso
                  // vira um botão de 26px que ninguém acerta.
                  className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span
                    className={cn(
                      'size-[26px] rounded-full border-2',
                      selected ? 'border-fg ring-2 ring-surface' : 'border-transparent',
                    )}
                    style={{ background: swatch }}
                  />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Barbeiros que executam" ids={barberFieldIds}>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border p-2">
            {barbers.map((barber) => (
              <label
                key={barber.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-2 hover:bg-surface-2"
              >
                <Checkbox checked={barberIds.includes(barber.id)} onChange={() => toggleBarber(barber.id)} />
                <Avatar name={barber.name} src={barber.avatarUrl} size="sm" />
                <span className="text-[13px] text-fg">{barber.name}</span>
              </label>
            ))}
            {barbers.length === 0 && (
              <p className="px-2 py-2 text-[13px] text-fg-muted">Cadastre um barbeiro primeiro.</p>
            )}
          </div>
        </Field>

        <Input label="Categoria (opcional)" value={category} onChange={(event) => setCategory(event.target.value)} />
        <Textarea
          label="Descrição (opcional)"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}
