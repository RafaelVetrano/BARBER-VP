/**
 * Mockup flutuante do painel — a arte do `Cadastro Estabelecimento`.
 *
 * É decoração: `aria-hidden` inteiro, e os números são ilustrativos (não vêm
 * da API porque não representam barbearia nenhuma). A regra "zero dado mockado"
 * vale para dado de negócio exibido como real; isto é ilustração de marketing,
 * como a foto de um anúncio.
 */
const CHART_BARS = [44, 60, 52, 74, 66, 90, 82];

export function DashboardMockup() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[26rem] -rotate-3 animate-bvp-float overflow-hidden rounded-2xl border border-border bg-surface shadow-modal ring-1 ring-gold/10"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="size-2.5 rounded-full bg-border-strong" />
        <span className="ml-auto text-[11px] font-bold tracking-wide text-fg-subtle">
          PAINEL · HOJE
        </span>
      </div>

      <div className="p-4">
        <div className="mb-3.5 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              Faturamento
            </p>
            <p className="font-display text-xl font-bold tracking-tight text-gold">R$ 3.240</p>
            <p className="mt-0.5 text-[10.5px] font-medium text-success">↑ 12% na semana</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              Agendamentos
            </p>
            <p className="font-display text-xl font-bold tracking-tight text-fg">28</p>
            <p className="mt-0.5 text-[10.5px] font-medium text-fg-muted">4 horários livres</p>
          </div>
        </div>

        <div className="mb-3.5 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-muted">Receita · 7 dias</span>
            <span className="text-[11px] font-bold text-gold">+18%</span>
          </div>
          <div className="flex h-16 items-end gap-1.5">
            {CHART_BARS.map((height, index) => (
              <span
                key={height}
                style={{ height: `${height}%` }}
                className={`flex-1 rounded-t ${
                  index === 5 ? 'bg-gradient-to-b from-gold-hover to-gold' : 'bg-gold/25'
                }`}
              />
            ))}
          </div>
        </div>

        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
          Próximos
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 shrink-0 text-[11px] font-bold text-gold">10:15</span>
            <span className="size-6 shrink-0 rounded-full bg-gradient-to-br from-gold-hover to-gold" />
            <span className="flex-1 text-xs font-semibold text-fg">Rafael M.</span>
            <span className="text-[11px] font-medium text-fg-subtle">Corte + Barba</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-9 shrink-0 text-[11px] font-bold text-fg-muted">11:00</span>
            <span className="size-6 shrink-0 rounded-full bg-surface-3" />
            <span className="flex-1 text-xs font-semibold text-fg">Diego S.</span>
            <span className="text-[11px] font-medium text-fg-subtle">Degradê</span>
          </div>
        </div>
      </div>
    </div>
  );
}
