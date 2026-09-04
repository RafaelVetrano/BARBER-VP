'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Modal, useToast } from '@barbervp/ui';
import {
  WHATSAPP_TEMPLATE_VARS,
  renderWhatsappTemplate,
  type WhatsappAutomationItem,
  type WhatsappTemplateSample,
} from '@barbervp/types';
import { useUpdateWhatsappAutomationMutation } from '@/lib/dashboard/api/whatsapp';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import { AUTOMATION_LABELS } from './automation-labels';
import { WhatsappBubble } from './whatsapp-bubble';

/**
 * Modal "Editar mensagem · <automação>" — protótipo l.4285–4315.
 *
 * As três peças do desenho: os chips de variável que INSEREM NO CURSOR
 * (`insertWaVar`, l.5982), a textarea e a pré-visualização em balão de
 * WhatsApp com os placeholders resolvidos (`applySample`, l.6054).
 */
export function MessageEditorModal({
  automation,
  sample,
  open,
  onClose,
}: {
  automation: WhatsappAutomationItem | null;
  /** Exemplos REAIS da barbearia, vindos de `GET /whatsapp-config`. */
  sample: WhatsappTemplateSample;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateWhatsappAutomationMutation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !automation) return;
    setText(automation.template);
    setError(null);
  }, [open, automation]);

  if (!automation) return null;

  const insertVar = (variable: string) => {
    const field = textareaRef.current;
    const at = field?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}${variable}${text.slice(at)}`;
    setText(next);
    // Devolve o foco e deixa o cursor DEPOIS da variável inserida — sem isto,
    // clicar em dois chips seguidos empilharia os dois no início do texto.
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(at + variable.length, at + variable.length);
    });
  };

  const save = async () => {
    const template = text.trim();
    if (template.length < 5) {
      setError('Escreva a mensagem antes de salvar.');
      return;
    }
    try {
      await update.mutateAsync({ event: automation.event, dto: { template } });
      toast({ message: 'Modelo de mensagem salvo.', tone: 'success' });
      onClose();
    } catch (cause) {
      setError(
        isFeatureGateError(cause)
          ? 'Esta automação faz parte do WhatsApp completo — faça upgrade para editá-la.'
          : 'Não foi possível salvar a mensagem. Tente de novo.',
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      // 720px é a largura do diálogo no protótipo (l.4287). Com os 480px
      // padrão do `Modal`, os chips quebram em três linhas e a
      // pré-visualização fica espremida ao lado da textarea.
      className="md:w-[720px] md:max-w-[94vw]"
      title={`Editar mensagem · ${AUTOMATION_LABELS[automation.event]}`}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={update.isPending} onClick={() => void save()}>
            Salvar
          </Button>
        </div>
      }
    >
      {/* Duas colunas a partir de `md`, empilhadas abaixo — o `flex-wrap` com
          `min-width:280px` do protótipo (l.4293). */}
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {WHATSAPP_TEMPLATE_VARS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => insertVar(`{${name}}`)}
                className="min-h-11 whitespace-nowrap rounded-full bg-gold/15 px-2.5 text-[11px] font-semibold text-gold transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:min-h-0 md:py-[5px]"
              >
                {`{${name}}`}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Texto da mensagem"
            className="w-full resize-y rounded-[10px] border border-border bg-surface-2 p-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 md:w-60 md:shrink-0">
          <span className="text-xs font-semibold uppercase tracking-[0.4px] text-fg-muted">
            Pré-visualização
          </span>
          <WhatsappBubble text={renderWhatsappTemplate(text, sample)} className="min-h-40" />
        </div>
      </div>
    </Modal>
  );
}
