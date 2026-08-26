'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, Button, Skeleton, SparkleIcon, useToast } from '@barbervp/ui';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { ChatComposer } from '@/components/dashboard/assistant/chat-composer';
import { ChatHeader } from '@/components/dashboard/assistant/chat-header';
import { ChatMessage } from '@/components/dashboard/assistant/chat-message';
import { useAiChatHistoryQuery, useSendAiChatMessageMutation } from '@/lib/dashboard/api/assistant';

/**
 * Aba Assistente IA (protótipo `Dashboard.dc.html` l.2818–3000).
 *
 * A tela é uma COLUNA de altura fixa — header, rolagem e rodapé — e não a
 * pilha de cards das demais abas: no protótipo o campo de pergunta fica
 * ancorado embaixo, e só o meio rola. Daí o `min-h-0` no trecho central, sem
 * o qual o flex deixa a coluna crescer e o rodapé sai da tela.
 */
export default function AssistenteIaPage() {
  const { toast } = useToast();
  const historyQuery = useAiChatHistoryQuery();
  const send = useSendAiChatMessageMutation();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = historyQuery.data?.messages ?? [];
  const usage = historyQuery.data?.usage;
  // 403 aqui é o `@Roles('OWNER','MANAGER')` do controller, não uma falha de
  // rede: a tela explica o recorte em vez de oferecer um retry que nunca passa.
  const denied = historyQuery.error instanceof ApiError && historyQuery.error.isForbidden;

  // Rolar para o fim a cada turno novo. `scrollTop` no contêiner (e não
  // `scrollIntoView` numa âncora) evita arrastar a página inteira do painel.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, send.isPending]);

  const submit = async () => {
    const content = input.trim();
    if (!content) return;
    setInput('');
    try {
      await send.mutateAsync(content);
    } catch (error) {
      // Devolver o texto ao campo é o que impede a pergunta de sumir quando o
      // envio falha — inclusive no 403 de cota, em que ela nem foi gravada.
      setInput(content);
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.',
        tone: 'danger',
      });
    }
  };

  return (
    <DashboardChrome activeKey="assistente-ia">
      <div className="flex h-[calc(100dvh-9.5rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-bg">
        <ChatHeader />

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
            {historyQuery.isLoading ? (
              <HistorySkeleton />
            ) : denied ? (
              // BARBER que força a URL: o nav não oferece o link, mas quem
              // recusa é o servidor. Repetir o pedido não muda nada, então
              // aqui não há "tentar de novo" — só a explicação.
              <ChatNotice
                title="O assistente é do dono e do gerente."
                description="O Navalha responde sobre faturamento e base de clientes, que não fazem parte da sua visão. Sua agenda e suas comissões continuam em Agenda e Comissões."
              />
            ) : historyQuery.isError ? (
              <ChatNotice
                title="Não foi possível carregar a conversa."
                description="O histórico está no servidor — nada foi perdido."
                action={
                  <Button variant="outline" onClick={() => void historyQuery.refetch()}>
                    Tentar de novo
                  </Button>
                }
              />
            ) : messages.length === 0 ? (
              <ChatNotice
                title="Comece a conversa com o Navalha."
                description="Pergunte sobre faturamento, ticket médio, a agenda do dia ou quem anda sumido. As sugestões aqui embaixo são um bom começo."
              />
            ) : (
              messages.map((message) => <ChatMessage key={message.id} message={message} />)
            )}

            {/* Turno otimista: a pergunta aparece no ato, como no protótipo —
                esperar o servidor para desenhar o próprio balão faz a tela
                parecer travada. Some sozinho quando o histórico volta com ela. */}
            {send.isPending && send.variables !== undefined && (
              <>
                <div className="max-w-[85%] self-end rounded-[14px_14px_4px_14px] bg-surface-3 px-4 py-3 text-sm leading-relaxed text-fg md:max-w-[70%]">
                  {send.variables}
                </div>
                <PendingReply />
              </>
            )}
          </div>
        </div>

        {!denied && (
          <ChatComposer
            usage={usage}
            suggestions={historyQuery.data?.suggestions ?? []}
            value={input}
            onChange={setInput}
            onSubmit={() => void submit()}
            sending={send.isPending}
          />
        )}
      </div>
    </DashboardChrome>
  );
}

/** Vazio, recusa e erro compartilham a moldura: os três são "a conversa não está aí". */
function ChatNotice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-gold/10 text-gold">
        <SparkleIcon size={24} />
      </span>
      <p className="font-display text-base font-bold text-fg">{title}</p>
      <p className="max-w-[420px] text-sm text-fg-muted">{description}</p>
      {action}
    </div>
  );
}

/**
 * Esqueleto com a MESMA silhueta da conversa (balão à direita, balão à
 * esquerda), para a troca não empurrar o layout quando o histórico chega.
 */
function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-5">
          <Skeleton className="h-11 w-[55%] self-end rounded-[14px_14px_4px_14px]" />
          <div className="flex items-start gap-2.5">
            <Skeleton className="size-8 shrink-0 rounded-[9px]" />
            <Skeleton className="h-[72px] w-[68%] rounded-[4px_14px_14px_14px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Digitando" — o turno do assistente já ocupa o lugar dele enquanto responde. */
function PendingReply() {
  return (
    <div className="flex items-start gap-2.5">
      <Skeleton className="size-8 shrink-0 rounded-[9px]" />
      <div className="flex items-center gap-1.5 rounded-[4px_14px_14px_14px] border border-border bg-surface px-4 py-3.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 animate-bvp-shimmer rounded-full bg-fg-muted"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
        <span className="sr-only">Navalha está respondendo</span>
      </div>
    </div>
  );
}
