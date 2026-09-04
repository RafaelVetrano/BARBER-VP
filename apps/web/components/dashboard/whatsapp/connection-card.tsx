'use client';

import { ChatIcon, Skeleton } from '@barbervp/ui';
import type { WhatsappConnection } from '@barbervp/types';
import { BlockError } from '@/components/dashboard/blocks';

/**
 * Card "Conexão com WhatsApp" — protótipo `Dashboard.dc.html` l.1626–1657.
 *
 * O desenho tem um toggle "Demonstração: conectado" que alterna entre um
 * número pareado e um QR code. Os dois estados são cenografia do protótipo: o
 * toggle existe só para o revisor ver as duas telas, e o QR é gerado por uma
 * fórmula (`qrCells`, l.6044) que não codifica nada.
 *
 * Aqui o estado vem do `NOTIFICATION_ADAPTER` de verdade. Enquanto o driver é
 * o mock da fase 09, o card diz "modo de demonstração" e mostra a trilha real
 * (quantas mensagens já foram para o outbox) — não um telefone inventado nem
 * um QR que não pareia com coisa nenhuma. Fingir o pareamento seria a única
 * mentira possível numa tela cujo assunto é justamente se as mensagens saem.
 */
export function ConnectionCard({
  connection,
  isLoading,
  isError,
  onRetry,
}: {
  connection: WhatsappConnection | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold text-fg">Conexão com WhatsApp</h2>
        {connection && (
          <span className="text-xs text-fg-muted">
            {connection.messagesSent === 1
              ? '1 mensagem registrada'
              : `${connection.messagesSent} mensagens registradas`}
          </span>
        )}
      </div>

      {isLoading && <Skeleton className="h-[74px] rounded-[10px]" />}

      {isError && !isLoading && <BlockError label="o estado da conexão" onRetry={onRetry} />}

      {connection && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-surface-2 px-4 py-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                connection.connected ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
              }`}
            >
              <ChatIcon size={18} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-fg">
                {connection.connected
                  ? `Conectado como ${connection.phone ?? 'número do provedor'}`
                  : 'Modo de demonstração'}
              </span>
              <span className="max-w-[46ch] text-[13px] text-fg-muted">
                {connection.connected
                  ? 'As automações abaixo saem por este número.'
                  : 'As automações já funcionam: cada mensagem é registrada no histórico abaixo, mas ainda não sai para o celular do cliente. O pareamento com um número real entra junto com o provedor de WhatsApp.'}
              </span>
            </div>
          </div>

          {/* O "Desconectar" do protótipo (l.1639) só existe com provedor real
              do outro lado — e o endpoint que o desfaria nasce junto com ele.
              Um botão desligado aqui seria decoração (regra 2). */}
        </div>
      )}
    </section>
  );
}
