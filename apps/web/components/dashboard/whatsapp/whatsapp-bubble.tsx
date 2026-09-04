'use client';

import { cn } from '@barbervp/ui';

/**
 * Balão de conversa da pré-visualização — protótipo l.4303–4306 e l.4324.
 *
 * As duas cores são as do WhatsApp e não do design system de propósito: o
 * ponto do bloco é o dono ver a mensagem COMO ELA VAI CHEGAR. São as mesmas
 * do desenho (`#0B141A` de fundo, `#005C4B` no balão) e ficam fixas nos dois
 * temas — a conversa não muda de cor porque o painel mudou.
 */
export function WhatsappBubble({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('flex rounded-[10px] bg-[#0B141A] px-3 py-4', className)}>
      <p className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-[#005C4B] px-2.5 py-2 text-[13px] text-[#E9EDEF]">
        {text}
      </p>
    </div>
  );
}
