'use client';

import { SparkleIcon } from '@barbervp/ui';
import type { AiChatMessageItem } from '@barbervp/types';
import { AssistantCard } from './assistant-card';

/**
 * Selo dourado do Navalha — o mesmo quadrado com a faísca que o protótipo usa
 * no header (36px, l.2823) e ao lado de cada resposta (32px, l.2843).
 */
export function NavalhaMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-gold text-bg"
      style={{ width: size, height: size }}
    >
      <SparkleIcon size={Math.round(size / 2)} />
    </span>
  );
}

/**
 * Um turno da conversa (protótipo l.2840–2934).
 *
 * A assimetria dos cantos é do original e é o que dá o "rabinho" do balão:
 * usuário `14/14/4/14` colado à direita, assistente `4/14/14/14` colado ao
 * avatar. Trocar por raio uniforme descaracteriza o desenho.
 */
export function ChatMessage({ message }: { message: AiChatMessageItem }) {
  if (message.role === 'USER') {
    return (
      <div className="max-w-[85%] self-end rounded-[14px_14px_4px_14px] bg-surface-3 px-4 py-3 text-sm leading-relaxed text-fg md:max-w-[70%]">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <NavalhaMark />
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2.5 md:max-w-[70%]">
        <div className="rounded-[4px_14px_14px_14px] border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg">
          {message.content}
        </div>
        {message.card && <AssistantCard card={message.card} />}
      </div>
    </div>
  );
}
