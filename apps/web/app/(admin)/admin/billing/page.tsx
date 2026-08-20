'use client';

import { Badge, Button, ResponsiveTable, useToast, type TableColumn } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { AdminInvoiceItem } from '@barbervp/types';
import { AdminShell } from '@/components/admin/admin-shell';
import { useAdminInvoicesQuery, useApproveInvoiceMutation, useRejectInvoiceMutation, useRunBillingCycleMutation } from '@/lib/admin/api/billing';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};

export default function BillingPage() {
  const { toast } = useToast();
  const invoicesQuery = useAdminInvoicesQuery({ perPage: 50 });
  const runCycle = useRunBillingCycleMutation();
  const approve = useApproveInvoiceMutation();
  const reject = useRejectInvoiceMutation();

  const handleRunCycle = async () => {
    try {
      const result = await runCycle.mutateAsync();
      toast({ message: `Ciclo rodado — ${result.charged} fatura(s) gerada(s).`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível rodar o ciclo.', tone: 'danger' });
    }
  };

  const handleReject = async (id: string) => {
    try {
      const result = await reject.mutateAsync(id);
      toast({
        message: result.suspended ? 'Fatura recusada — tenant suspenso automaticamente.' : 'Fatura recusada.',
        tone: result.suspended ? 'warning' : 'success',
      });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível recusar.', tone: 'danger' });
    }
  };

  const columns: TableColumn<AdminInvoiceItem>[] = [
    { key: 'tenant', header: 'Tenant', mobile: 'title', render: (row) => row.tenantName },
    { key: 'plan', header: 'Plano', mobile: 'subtitle', render: (row) => row.planName },
    { key: 'amount', header: 'Valor', align: 'right', mobile: 'meta', render: (row) => formatBRL(row.amountCents) },
    { key: 'issued', header: 'Emitida em', mobile: 'meta', render: (row) => new Date(row.issuedAt).toLocaleDateString('pt-BR') },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
  ];

  return (
    <AdminShell
      activeKey="billing"
      topbarActions={
        <Button size="sm" loading={runCycle.isPending} onClick={() => void handleRunCycle()}>
          Rodar ciclo de cobrança
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Billing</h1>
        <p className="text-sm text-fg-muted">
          Ciclo simulado via gateway mock — &ldquo;rodar ciclo&rdquo; gera uma fatura pendente para cada tenant com o período vencido.
        </p>

        <ResponsiveTable
          columns={columns}
          rows={invoicesQuery.data?.data ?? []}
          getRowKey={(row) => row.id}
          caption="Faturas"
          actions={(row) =>
            row.status === 'PENDING'
              ? [
                  { label: 'Aprovar', onSelect: () => approve.mutate(row.id) },
                  { label: 'Recusar', destructive: true, onSelect: () => void handleReject(row.id) },
                ]
              : []
          }
        />
      </div>
    </AdminShell>
  );
}
