'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangleIcon,
  Button,
  Card,
  ClockIcon,
  CreditCardIcon,
  GiftIcon,
} from '@barbervp/ui';
import { formatBRL, type DashboardAlerts } from '@barbervp/types';

interface AlertDef {
  key: string;
  icon: ReactNode;
  /** Cor do quadrado do ícone — `rgba(cor, .15)` de fundo, cor cheia no traço. */
  color: string;
  text: string;
  actions: Array<{ label: string; href: string; variant?: 'primary' | 'outline' }>;
}

/**
 * Faixa de alertas acionáveis (`Dashboard.dc.html`, linhas 338–392).
 *
 * Cada card só existe quando a condição é verdadeira — a API devolve as
 * contagens e um zero não vira card. É a diferença entre "você tem 12 clientes
 * parados" e "você tem 0 clientes parados", que é ruído.
 *
 * Um card ausente pode ter três causas, todas legítimas: a condição é falsa, o
 * plano não cobre o recurso (`dueBills: null` sem `contasPagarReceber`), ou o
 * papel é `BARBER`, que não administra caixa nem base de clientes.
 */
export function AlertsStrip({ alerts }: { alerts: DashboardAlerts }) {
  const router = useRouter();
  const cards: AlertDef[] = [];

  if (alerts.inactiveClients > 0) {
    cards.push({
      key: 'inactive',
      icon: <AlertTriangleIcon size={18} />,
      color: '#E8A13C',
      text: `${alerts.inactiveClients} ${alerts.inactiveClients === 1 ? 'cliente sem visita há' : 'clientes sem visita há'} 30+ dias`,
      actions: [
        { label: 'Ver lista', href: '/app/clientes?filtro=inativos', variant: 'outline' },
        { label: 'Enviar mensagem de reativação', href: '/app/whatsapp?evento=REACTIVATION' },
      ],
    });
  }

  if (alerts.dueBills && alerts.dueBills.count > 0) {
    cards.push({
      key: 'bills',
      icon: <CreditCardIcon size={18} />,
      color: '#E05B5B',
      text: `${alerts.dueBills.count} ${alerts.dueBills.count === 1 ? 'conta vence' : 'contas vencem'} esta semana (${formatBRL(alerts.dueBills.totalCents)})`,
      actions: [{ label: 'Abrir contas a pagar', href: '/app/financeiro?tab=pagar' }],
    });
  }

  if (alerts.cashRegisterOpen === false) {
    cards.push({
      key: 'cash',
      icon: <ClockIcon size={18} />,
      color: '#5B8DE0',
      text: 'Caixa de hoje ainda não foi aberto',
      actions: [{ label: 'Abrir caixa', href: '/app/financeiro?tab=caixa' }],
    });
  }

  if (alerts.birthdays > 0) {
    cards.push({
      key: 'birthdays',
      icon: <GiftIcon size={18} />,
      color: '#D4A84C',
      text: `${alerts.birthdays} ${alerts.birthdays === 1 ? 'cliente faz aniversário' : 'clientes fazem aniversário'} esta semana`,
      actions: [{ label: 'Enviar parabéns', href: '/app/whatsapp?evento=BIRTHDAY' }],
    });
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-4">
      {cards.map((card) => (
        <Card key={card.key} className="min-w-[280px] flex-1 flex-row items-center gap-3.5">
          <span
            aria-hidden="true"
            className="grid size-[38px] shrink-0 place-items-center rounded-[9px]"
            style={{ background: `${card.color}26`, color: card.color }}
          >
            {card.icon}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[13px] font-medium leading-snug text-fg">{card.text}</p>
            <div className="flex flex-wrap gap-2">
              {card.actions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.variant === 'outline' ? 'outline' : 'primary'}
                  onClick={() => router.push(action.href)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
