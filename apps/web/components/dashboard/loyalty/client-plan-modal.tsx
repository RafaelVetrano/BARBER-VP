'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, CloseIcon, IconButton, Input, Modal, Select, useToast } from '@barbervp/ui';
import { formatBRL, parseBRLToCents } from '@barbervp/types';
import type { ClientPlanAdminItem, ServiceListItem } from '@barbervp/types';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useArchiveClientPlanMutation,
  useDeleteClientPlanMutation,
  useSaveClientPlanMutation,
} from '@/lib/dashboard/api/loyalty';

export interface ClientPlanModalProps {
  open: boolean;
  onClose: () => void;
  /** `null` = modo "Novo plano"; preenchido = modo "Editar plano". */
  plan: ClientPlanAdminItem | null;
  services: ServiceListItem[];
}

interface ItemRow {
  serviceId: string;
  quota: string;
}

/** `diaCobrancaOptions` do protótipo (l.3356): 1 a 28, sem o 29 que fevereiro não tem. */
const BILLING_DAYS = Array.from({ length: 28 }, (_, index) => String(index + 1));

const emptyRow = (services: ServiceListItem[]): ItemRow => ({
  serviceId: services[0]?.id ?? '',
  quota: '',
});

/**
 * `parseBRLToCents` levanta em entrada vazia ou inválida, e aqui o preço é
 * lido a CADA render (é ele que habilita o CTA) — inclusive no primeiro, com o
 * campo em branco. Zero é a leitura certa de "ainda não vale nada": o CTA
 * continua desabilitado e a tela não quebra enquanto o dono digita.
 */
function priceCentsOf(input: string): number {
  if (!input.trim()) return 0;
  try {
    return parseBRLToCents(input);
  } catch {
    return 0;
  }
}

/**
 * Modal `modalNewPlano` do protótipo (`Dashboard.dc.html` l.3323), com os dois
 * modos que o desenho prevê (l.3364): "Novo plano" → "Criar plano" e "Editar
 * plano" → "Salvar alterações" + "Excluir plano" no canto.
 *
 * Duas confirmações penduradas nele, também do protótipo: "Impacto nos
 * assinantes" (l.3376) quando preço/serviços mudam num plano que já tem gente,
 * e "Excluir plano" (l.3384), que troca de CTA conforme o plano tenha ou não
 * histórico de assinaturas.
 *
 * **Desvio consciente**: o campo de serviço é um `<select>` do catálogo, e não
 * o texto livre do protótipo. Quota de plano é abatida do saldo do cliente
 * (`SubscriptionUsage`) contra um `Service` real — texto livre não teria em
 * que descontar.
 */
export function ClientPlanModal({ open, onClose, plan, services }: ClientPlanModalProps) {
  const { toast } = useToast();
  const save = useSaveClientPlanMutation();
  const archive = useArchiveClientPlanMutation();
  const remove = useDeleteClientPlanMutation();

  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [billingDay, setBillingDay] = useState('5');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [confirming, setConfirming] = useState<'impact' | 'delete' | null>(null);

  const isEdit = plan !== null;

  useEffect(() => {
    if (!open) return;
    setConfirming(null);
    setName(plan?.name ?? '');
    setPriceInput(plan ? (plan.priceCents / 100).toFixed(2).replace('.', ',') : '');
    setBillingDay(String(plan?.billingDay ?? 5));
    setItems(
      plan && plan.items.length > 0
        ? plan.items.map((item) => ({ serviceId: item.serviceId, quota: String(item.quota) }))
        : [emptyRow(services)],
    );
    // `services` fica de fora: recarregar o catálogo com o modal aberto não pode
    // apagar o que o dono já digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);

  const priceCents = priceCentsOf(priceInput);
  const filledItems = items.filter((item) => item.serviceId && Number(item.quota) >= 1);

  // `isPlanoFormValid` do protótipo (l.5906): nome, preço > 0 e ao menos um
  // serviço com quantidade.
  const canSubmit = name.trim().length > 1 && priceCents > 0 && filledItems.length > 0;

  const serviceOptions = useMemo(
    () => services.map((service) => ({ value: service.id, label: service.name })),
    [services],
  );

  /** Só vale confirmar impacto se algo que o assinante sente de fato mudou. */
  const changesAffectSubscribers = useMemo(() => {
    if (!plan) return false;
    if (plan.priceCents !== priceCents) return true;
    const before = plan.items
      .map((item) => `${item.serviceId}:${item.quota}`)
      .sort()
      .join('|');
    const after = filledItems
      .map((item) => `${item.serviceId}:${Number(item.quota)}`)
      .sort()
      .join('|');
    return before !== after;
  }, [plan, priceCents, filledItems]);

  const persist = async () => {
    try {
      await save.mutateAsync({
        id: plan?.id,
        dto: {
          name: name.trim(),
          priceCents,
          billingDay: Number(billingDay),
          items: filledItems.map((item) => ({ serviceId: item.serviceId, quota: Number(item.quota) })),
        },
      });
      toast({ message: isEdit ? 'Plano atualizado.' : 'Plano criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível salvar o plano.',
        tone: 'danger',
      });
    }
  };

  const submit = () => {
    if (!canSubmit) return;
    if (isEdit && plan.subscriberCount > 0 && changesAffectSubscribers) {
      setConfirming('impact');
      return;
    }
    void persist();
  };

  const confirmDelete = async () => {
    if (!plan) return;
    try {
      if (plan.canDelete) {
        await remove.mutateAsync(plan.id);
        toast({ message: 'Plano excluído.', tone: 'success' });
      } else {
        await archive.mutateAsync(plan.id);
        toast({ message: 'Plano arquivado.', tone: 'success' });
      }
      setConfirming(null);
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível concluir a ação.',
        tone: 'danger',
      });
    }
  };

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const busy = save.isPending || archive.isPending || remove.isPending;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? 'Editar plano' : 'Novo plano'}
        dismissOnOverlayClick={!busy}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {isEdit ? (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirming('delete')}>
                Excluir plano
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button loading={save.isPending} disabled={!canSubmit} onClick={submit}>
                {isEdit ? 'Salvar alterações' : 'Criar plano'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Input
            label="Nome do plano"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Preço mensal (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
          />

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-fg-muted">Serviços incluídos</p>
            {items.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <Select
                  label={index === 0 ? 'Serviço' : undefined}
                  aria-label={index === 0 ? undefined : `Serviço ${index + 1}`}
                  className="flex-1"
                  value={item.serviceId}
                  onChange={(event) => updateItem(index, { serviceId: event.target.value })}
                  options={serviceOptions}
                />
                <Input
                  label={index === 0 ? 'Qtd/mês' : undefined}
                  aria-label={index === 0 ? undefined : `Quantidade do serviço ${index + 1}`}
                  className="w-[92px]"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={item.quota}
                  onChange={(event) => updateItem(index, { quota: event.target.value })}
                />
                {items.length > 1 && (
                  <IconButton
                    variant="ghost"
                    aria-label={`Remover o serviço ${index + 1} do plano`}
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  >
                    <CloseIcon size={16} />
                  </IconButton>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              // Sem serviço no catálogo não há linha nova para preencher — a
              // aba Serviços & Produtos é quem resolve isso.
              disabled={services.length === 0}
              onClick={() => setItems((current) => [...current, emptyRow(services)])}
            >
              + Adicionar serviço
            </Button>
            {services.length === 0 && (
              <p className="text-xs text-fg-muted">
                Cadastre um serviço em Serviços &amp; Produtos para montar o plano.
              </p>
            )}
          </div>

          <Select
            label="Dia de cobrança"
            value={billingDay}
            onChange={(event) => setBillingDay(event.target.value)}
            options={BILLING_DAYS.map((day) => ({ value: day, label: day }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming === 'impact'}
        onClose={() => setConfirming(null)}
        title="Impacto nos assinantes"
        description={
          plan
            ? `Este plano tem ${plan.subscriberCount} assinante(s). O novo valor de ${formatBRL(priceCents)} e os serviços passam a valer a partir da próxima cobrança de cada um.`
            : ''
        }
        confirmLabel="Confirmar alteração"
        cancelLabel="Voltar"
        busy={save.isPending}
        onConfirm={() => void persist()}
      />

      <ConfirmDialog
        open={confirming === 'delete'}
        onClose={() => setConfirming(null)}
        title={plan?.canDelete ? 'Excluir plano' : 'Arquivar plano'}
        description={
          plan?.canDelete
            ? `Excluir "${plan.name}"? Essa ação não pode ser desfeita.`
            : `"${plan?.name}" já teve assinantes. Não dá para excluir sem apagar o histórico — arquive para que ele saia da vitrine do cliente sem afetar quem já assina.`
        }
        confirmLabel={plan?.canDelete ? 'Excluir plano' : 'Arquivar plano'}
        tone={plan?.canDelete ? 'danger' : 'primary'}
        busy={archive.isPending || remove.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
