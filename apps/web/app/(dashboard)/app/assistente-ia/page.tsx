'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, SparkleIcon, Skeleton, useToast } from '@barbervp/ui';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { useAiChatHistoryQuery, useSendAiChatMessageMutation } from '@/lib/dashboard/api/assistant';

export default function AssistenteIaPage() {
  const { toast } = useToast();
  const historyQuery = useAiChatHistoryQuery();
  const send = useSendAiChatMessageMutation();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = historyQuery.data?.messages ?? [];
  const usage = historyQuery.data?.usage;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const limitReached = usage?.limit !== null && usage !== undefined && usage.used >= (usage.limit ?? 0);

  const submit = async () => {
    if (!input.trim() || limitReached) return;
    const content = input.trim();
    setInput('');
    try {
      await send.mutateAsync(content);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.', tone: 'danger' });
    }
  };

  return (
    <DashboardChrome activeKey="assistente-ia">
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SparkleIcon size={20} className="text-gold" />
            <h1 className="font-display text-xl font-bold text-fg">Navalha — Assistente IA</h1>
          </div>
          {usage && (
            <span className="text-xs text-fg-muted">
              {usage.used}
              {usage.limit !== null ? ` / ${usage.limit}` : ''} mensagens este mês
            </span>
          )}
        </div>

        <Card className="min-h-0 flex-1 overflow-y-auto">
          {historyQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">
              Pergunte sobre faturamento, agenda ou peça sugestões para a barbearia.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-2 ${message.role === 'USER' ? 'flex-row-reverse' : ''}`}>
                  {message.role === 'ASSISTANT' && <Avatar name="Navalha" size="sm" />}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      message.role === 'USER' ? 'bg-gold text-bg' : 'bg-surface-2 text-fg'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </Card>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="h-11 flex-1 rounded-control border border-border bg-surface-2 px-3.5 text-sm text-fg outline-none disabled:opacity-50"
            placeholder={limitReached ? 'Limite de mensagens do plano atingido este mês' : 'Escreva sua pergunta...'}
            value={input}
            disabled={limitReached}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" loading={send.isPending} disabled={limitReached || !input.trim()}>
            Enviar
          </Button>
        </form>
      </div>
    </DashboardChrome>
  );
}
