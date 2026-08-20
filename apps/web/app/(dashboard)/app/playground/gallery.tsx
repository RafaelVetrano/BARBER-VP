'use client';

/**
 * Vitrine dos primitives de `packages/ui` (fase 02).
 *
 * Os textos e listas daqui são **amostra de vitrine**, não dados de produto:
 * existem só para dar forma aos componentes nesta página. A regra 2 (zero
 * dado mockado) vale para as telas reais, que chegam da fase 03 em diante e
 * consomem a API.
 */

import { useState } from 'react';
import {
  APPOINTMENT_STATUS_APPEARANCE,
  AppShellNavItem,
  AppointmentStatusPill,
  Avatar,
  Badge,
  BadgeTone,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DatePicker,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  OtpInput,
  PasswordInput,
  Radio,
  ResponsiveTable,
  Select,
  Skeleton,
  SkeletonGroup,
  StatCard,
  StatusPill,
  SuccessScreen,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  TimeSlotGrid,
  Toast,
  useToast,
  type DayOption,
  type TableColumn,
} from '@barbervp/ui';
import * as Icons from '@barbervp/ui';
import { AppointmentStatus } from '@barbervp/types';

/* ── Estrutura da página ─────────────────────────────────────────────── */

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-border pt-8 first:border-0 first:pt-0">
      <h2 className="font-display text-xl font-bold text-fg">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* ── 1. Tokens ───────────────────────────────────────────────────────── */

const SURFACES = [
  { name: 'bg', className: 'bg-bg' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-2', className: 'bg-surface-2' },
  { name: 'surface-3', className: 'bg-surface-3' },
];

const ACCENTS = [
  { name: 'gold', className: 'bg-gold' },
  { name: 'gold-hover', className: 'bg-gold-hover' },
  { name: 'success', className: 'bg-success' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'info', className: 'bg-info' },
  { name: 'warning', className: 'bg-warning' },
];

function TokensSection() {
  return (
    <Section id="tokens" title="Tokens">
      <Row label="Superfícies">
        {SURFACES.map((token) => (
          <div key={token.name} className="flex flex-col items-center gap-1.5">
            <span className={`size-16 rounded-xl border border-border ${token.className}`} />
            <span className="text-[11px] text-fg-muted">{token.name}</span>
          </div>
        ))}
      </Row>

      <Row label="Marca e semânticas">
        {ACCENTS.map((token) => (
          <div key={token.name} className="flex flex-col items-center gap-1.5">
            <span className={`size-16 rounded-xl ${token.className}`} />
            <span className="text-[11px] text-fg-muted">{token.name}</span>
          </div>
        ))}
      </Row>

      <Row label="Texto (contraste medido sobre bg)">
        <span className="text-fg">fg · 17.0:1 · AAA</span>
        <span className="text-fg-muted">fg-muted · 7.3:1 · AAA</span>
        <span className="text-fg-subtle">fg-subtle · 3.0:1 · só placeholder</span>
      </Row>

      <Row label="Tipografia">
        <span className="font-display text-2xl font-bold text-fg">Sora 700 · títulos</span>
        <span className="font-sans text-base text-fg">Inter 400 · corpo e UI</span>
      </Row>

      <Row label="Raios">
        {['rounded-lg 8', 'rounded-control 10', 'rounded-xl 12', 'rounded-2xl 16', 'rounded-3xl 24'].map(
          (label) => {
            const [cls] = label.split(' ');
            return (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <span className={`size-16 border border-gold bg-surface-2 ${cls}`} />
                <span className="text-[11px] text-fg-muted">{label}</span>
              </div>
            );
          },
        )}
      </Row>
    </Section>
  );
}

/* ── 2. Animações ────────────────────────────────────────────────────── */

const ANIMATIONS = [
  'animate-bvp-fade',
  'animate-bvp-up',
  'animate-bvp-pop',
  'animate-bvp-in-left',
  'animate-bvp-rise',
  'animate-bvp-fade-bg',
  'animate-bvp-glow',
  'animate-bvp-float',
  'animate-bvp-shimmer',
];

function AnimationsSection() {
  const [seed, setSeed] = useState(0);

  return (
    <Section id="animacoes" title="Animações">
      <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)}>
        Rodar de novo
      </Button>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ANIMATIONS.map((animation) => (
          <div key={animation} className="flex flex-col items-center gap-2">
            <span
              key={`${animation}-${seed}`}
              className={`grid size-16 place-items-center rounded-xl border border-gold/40 bg-surface-2 text-gold ${animation}`}
            >
              <Icons.ScissorsIcon size={22} />
            </span>
            <span className="text-center text-[11px] text-fg-muted">{animation.replace('animate-', '')}</span>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-fg-muted">
        <code className="text-gold">bvp-toast-in</code>, <code className="text-gold">bvp-success-pop</code>,{' '}
        <code className="text-gold">bvp-check-draw</code>, <code className="text-gold">bvp-otp-shake</code>,{' '}
        <code className="text-gold">bvp-ring</code> e <code className="text-gold">bvp-check</code> aparecem
        nos componentes que as usam (Toast, SuccessScreen, OtpInput).
      </p>
    </Section>
  );
}

/* ── 3. Ícones ───────────────────────────────────────────────────────── */

const ICON_NAMES = Object.keys(Icons).filter(
  (name) => name.endsWith('Icon') || name === 'EmptyCalendarArt',
) as Array<keyof typeof Icons>;

function IconsSection() {
  return (
    <Section id="icones" title={`Ícones (${ICON_NAMES.length})`}>
      <div className="grid grid-cols-3 gap-3 xs:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
        {ICON_NAMES.map((name) => {
          const Component = Icons[name] as (props: { size?: number }) => JSX.Element;
          return (
            <div
              key={name}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-2 p-3"
            >
              <span className="text-fg">
                <Component size={22} />
              </span>
              <span className="break-all text-center text-[10px] leading-tight text-fg-muted">{name}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ── 4. Botões ───────────────────────────────────────────────────────── */

function ButtonsSection() {
  return (
    <Section id="botoes" title="Button">
      <Row label="Variantes">
        <Button variant="primary">Confirmar agendamento</Button>
        <Button variant="outline">Compartilhar</Button>
        <Button variant="ghost">Fazer outro agendamento</Button>
        <Button variant="danger">Excluir conta</Button>
      </Row>
      <Row label="Tamanhos">
        <Button size="sm">Pequeno</Button>
        <Button size="md">Médio</Button>
        <Button size="lg">Grande</Button>
      </Row>
      <Row label="Estados">
        <Button loading loadingText="Verificando…">
          Verificar
        </Button>
        <Button disabled>Desabilitado</Button>
        <Button variant="outline" disabled>
          Desabilitado
        </Button>
        <Button iconLeft={<Icons.PlusIcon size={17} />}>Novo agendamento</Button>
        <Button variant="outline" iconRight={<Icons.ChevronRightIcon size={16} />}>
          Continuar
        </Button>
      </Row>
      <Row label="IconButton">
        <IconButton aria-label="Voltar">
          <Icons.ArrowLeftIcon size={18} />
        </IconButton>
        <IconButton aria-label="Fechar" variant="outline">
          <Icons.CloseIcon size={18} />
        </IconButton>
        <IconButton aria-label="Buscar" size="sm">
          <Icons.SearchIcon size={16} />
        </IconButton>
      </Row>
      <Row label="Largura total (CTA de sheet)">
        <div className="w-full max-w-sm">
          <Button fullWidth size="lg">
            Adicionar ao calendário
          </Button>
        </div>
      </Row>
    </Section>
  );
}

/* ── 5. Campos ───────────────────────────────────────────────────────── */

function FieldsSection() {
  const [password, setPassword] = useState('barber2026');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  return (
    <Section id="campos" title="Campos">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Nome completo" required placeholder="Seu nome" />
        <Input label="WhatsApp" required placeholder="(16) 9 9999-9999" inputMode="numeric" defaultValue="(16) 9 9999-9999" success />
        <Input label="E-mail" required placeholder="voce@email.com" defaultValue="email-invalido" error="E-mail inválido" />
        <Input label="Buscar" placeholder="Cliente, telefone…" addonLeft={<Icons.SearchIcon size={16} />} />
        <Input label="Campo desabilitado" placeholder="Indisponível" disabled />
        <Select
          label="Categoria"
          required
          placeholder="Selecione"
          defaultValue=""
          options={[
            { value: 'aluguel', label: 'Aluguel' },
            { value: 'produtos', label: 'Produtos' },
            { value: 'energia', label: 'Energia' },
          ]}
        />
        <Select
          label="Forma de pagamento"
          error="Escolha uma forma de pagamento"
          defaultValue=""
          placeholder="Selecione"
          options={[
            { value: 'pix', label: 'Pix' },
            { value: 'credito', label: 'Cartão de crédito' },
          ]}
        />
        <PasswordInput
          label="Senha"
          required
          showStrength
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="mínimo 8 caracteres"
          hint="Digite para ver a força mudar"
        />
        <Textarea
          label="Observações"
          placeholder="Ex: máquina 2 na lateral"
          hint="Opcional"
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>

      <Row label="Seleção">
        <Checkbox label="Li e aceito os Termos de uso" defaultChecked />
        <Checkbox label="Desabilitado" disabled />
        <Radio name="pg-radio" label="Sem preferência" defaultChecked />
        <Radio name="pg-radio" label="Carlos Silva" description="Próximo livre: hoje 16:30" />
      </Row>

      <div className="max-w-sm">
        <Switch label="Lembrar meus dados neste aparelho" defaultChecked />
      </div>

      <div className="flex max-w-md flex-col gap-3">
        <p className="text-[11px] uppercase tracking-wide text-fg-muted">OtpInput</p>
        <OtpInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            setOtpError(null);
          }}
          error={otpError}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOtpError('Código inválido. Tente novamente.')}>
            Simular erro (shake)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOtp(''); setOtpError(null); }}>
            Limpar
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ── 6. Overlays ─────────────────────────────────────────────────────── */

function OverlaysSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  return (
    <Section id="overlays" title="Overlays">
      <p className="text-[13px] text-fg-muted">
        Abaixo de 768px o painel é bottom-sheet (alça, topo arredondado, sobe de baixo); a partir de
        768px o Modal fica centrado e o Drawer entra pela lateral. Fecha com ESC, clique no fundo e ✕.
      </p>

      <Row label="Abrir">
        <Button onClick={() => setModalOpen(true)}>Modal</Button>
        <Button variant="outline" onClick={() => setDrawerOpen(true)}>
          Drawer
        </Button>
      </Row>

      <Row label="Toast">
        <Button size="sm" variant="outline" onClick={() => toast('Link copiado!')}>
          neutral
        </Button>
        <Button size="sm" variant="outline" onClick={() => toast({ message: 'Agendamento confirmado', tone: 'success' })}>
          success
        </Button>
        <Button size="sm" variant="outline" onClick={() => toast({ message: 'Não foi possível cancelar', tone: 'danger' })}>
          danger
        </Button>
        <Button size="sm" variant="outline" onClick={() => toast({ message: 'Restam 2 usos no ciclo', tone: 'warning' })}>
          warning
        </Button>
      </Row>

      <Row label="Toast estático (para inspeção)">
        <Toast message="Combo aplicado — sai mais barato" />
        <Toast message="Agendamento confirmado" tone="success" />
      </Row>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Escolha o serviço"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-base font-bold text-gold">R$ 70</span>
            <Button onClick={() => setModalOpen(false)}>Continuar</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            Conteúdo rolável: role até o fim para conferir que o cabeçalho e o rodapé ficam fixos.
          </p>
          {Array.from({ length: 12 }, (_, index) => (
            <Card key={index} tone="raised" className="flex-row items-center justify-between">
              <span className="text-sm text-fg">Linha de exemplo {index + 1}</span>
              <Badge tone="gold">45 min</Badge>
            </Card>
          ))}
        </div>
      </Modal>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Detalhes do cliente">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name="João Pedro Lima" size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">João Pedro Lima</p>
              <p className="text-[13px] text-fg-muted">(16) 9 9999-0001</p>
            </div>
          </div>
          <AppointmentStatusPill status={AppointmentStatus.CONFIRMED} />
          <p className="text-sm text-fg-muted">
            Painel lateral no desktop, bottom-sheet no celular — a mesma marcação nos dois.
          </p>
        </div>
      </Drawer>
    </Section>
  );
}

/* ── 7. Feedback ─────────────────────────────────────────────────────── */

function FeedbackSection() {
  return (
    <Section id="feedback" title="Feedback">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card tone="raised" className="items-center">
          <SuccessScreen
            title="Agendado! 🎉"
            subtitle="Te esperamos quinta-feira às 16:30"
            summary={[
              { icon: <Icons.ScissorsIcon size={15} className="text-fg-muted" />, label: 'Corte + Barba · 1h10' },
              { icon: <Icons.UserIcon size={15} className="text-fg-muted" />, label: 'Carlos Silva' },
              { icon: <Icons.CalendarIcon size={15} className="text-fg-muted" />, label: 'Quinta, 20 de agosto · 16:30' },
              { icon: <Icons.MoneyIcon size={15} className="text-gold" />, label: 'R$ 70', emphasis: true },
            ]}
            code={{ label: 'Código da reserva', value: 'AG-4821' }}
            actions={
              <>
                <Button fullWidth>Adicionar ao calendário</Button>
                <Button fullWidth variant="outline">
                  Compartilhar
                </Button>
              </>
            }
            note="Chegue 5 min antes · Cancele até 3h antes em Meus horários"
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card tone="raised" flush>
            <EmptyState
              message="Você ainda não tem horários marcados"
              action={<Button>Agendar horário</Button>}
            />
          </Card>

          <Card>
            <CardHeader title="Skeleton" description="Carregamento dos horários do wizard" />
            <SkeletonGroup className="mt-4 flex flex-col gap-4">
              <div>
                <Skeleton variant="text" className="mb-2.5 w-16" />
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((slot) => (
                    <Skeleton key={slot} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton variant="text" className="w-1/2" />
                  <Skeleton variant="text" className="w-1/3" />
                </div>
              </div>
            </SkeletonGroup>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ── 8. Dados ────────────────────────────────────────────────────────── */

const BADGE_TONES: BadgeTone[] = ['neutral', 'gold', 'success', 'warning', 'danger', 'info'];

interface DemoRow {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  visits: number;
  status: AppointmentStatus;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'João Pedro Lima', phone: '(16) 9 9999-0001', lastVisit: '12/08', visits: 24, status: AppointmentStatus.CONFIRMED },
  { id: '2', name: 'André Souza', phone: '(16) 9 9999-0002', lastVisit: '02/08', visits: 8, status: AppointmentStatus.SCHEDULED },
  { id: '3', name: 'Bruno Carvalho', phone: '(16) 9 9999-0003', lastVisit: '21/07', visits: 3, status: AppointmentStatus.NO_SHOW },
];

function DataSection() {
  const [tab, setTab] = useState('agendamentos');
  const [subTab, setSubTab] = useState('proximos');

  const columns: TableColumn<DemoRow>[] = [
    { key: 'name', header: 'Cliente', mobile: 'title', render: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span className="whitespace-nowrap">{row.name}</span>
      </span>
    ) },
    { key: 'phone', header: 'Telefone', mobile: 'subtitle', render: (row) => row.phone },
    { key: 'lastVisit', header: 'Última visita', mobile: 'meta', render: (row) => row.lastVisit },
    { key: 'visits', header: 'Visitas', align: 'right', mobile: 'meta', render: (row) => row.visits },
    { key: 'status', header: 'Status', render: (row) => <AppointmentStatusPill status={row.status} /> },
  ];

  return (
    <Section id="dados" title="Dados">
      <Row label="StatCard">
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Faturamento hoje"
            value="R$ 1.240,00"
            delta={{ label: '12% vs ontem', direction: 'up' }}
            sparkline={[8, 10, 13, 12, 18, 20, 23, 25]}
          />
          <StatCard label="Agendamentos hoje" value="23" hint="18 confirmados · 3 pendentes · 2 concluídos" />
          <StatCard
            label="Ticket médio (mês)"
            value="R$ 62,40"
            delta={{ label: '4%', direction: 'down' }}
            sparkline={[6, 9, 8, 14, 13, 19, 18, 24]}
          />
          <StatCard label="Novos clientes (mês)" value="38" delta={{ label: 'estável', direction: 'flat' }} />
        </div>
      </Row>

      <Row label="Badge / StatusPill">
        {BADGE_TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
        {BADGE_TONES.map((tone) => (
          <Badge key={`solid-${tone}`} tone={tone} variant="solid">
            {tone}
          </Badge>
        ))}
      </Row>

      <Row label="Status de agendamento (enum real)">
        {Object.entries(APPOINTMENT_STATUS_APPEARANCE).map(([status, appearance]) => (
          <StatusPill key={status} label={`${appearance.label} · ${status}`} tone={appearance.tone} />
        ))}
      </Row>

      <Row label="Avatar">
        <Avatar name="Carlos Silva" size="xs" />
        <Avatar name="Rafael Souza" size="sm" />
        <Avatar name="Diego Alves" size="md" />
        <Avatar name="Bruno Costa" size="lg" />
      </Row>

      <Row label="Menu (kebab)">
        <Menu
          label="Ações do cliente"
          items={[
            { label: 'Ver perfil', onSelect: () => undefined },
            { label: 'Agendar', onSelect: () => undefined },
            { label: 'Enviar WhatsApp', onSelect: () => undefined },
            { label: 'Bloquear', onSelect: () => undefined, destructive: true },
          ]}
        />
      </Row>

      <div className="flex flex-col gap-4">
        <p className="text-[11px] uppercase tracking-wide text-fg-muted">Tabs</p>
        <Tabs
          label="Seções da conta"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'agendamentos', label: 'Agendamentos' },
            { value: 'assinatura', label: 'Assinatura' },
            { value: 'dados', label: 'Meus dados' },
            { value: 'bloqueada', label: 'Bloqueada', disabled: true },
          ]}
        />
        <TabPanel value="agendamentos" active={tab}>
          <div className="flex flex-col gap-4">
            <Tabs
              variant="segmented"
              label="Filtro de agendamentos"
              idPrefix="bvp-subtab"
              value={subTab}
              onChange={setSubTab}
              items={[
                { value: 'proximos', label: 'Próximos', count: 2 },
                { value: 'historico', label: 'Histórico', count: 24 },
              ]}
            />
            <ResponsiveTable
              caption="Clientes de exemplo do playground"
              columns={columns}
              rows={DEMO_ROWS}
              getRowKey={(row) => row.id}
              getActionsLabel={(row) => `Ações de ${row.name}`}
              onRowClick={() => undefined}
              actions={(row) => [
                { label: 'Ver perfil', onSelect: () => undefined },
                { label: `Agendar para ${row.name.split(' ')[0]}`, onSelect: () => undefined },
                { label: 'Bloquear', onSelect: () => undefined, destructive: true },
              ]}
            />
          </div>
        </TabPanel>
        <TabPanel value="assinatura" active={tab}>
          <Card tone="raised">
            <CardHeader title="Corte + Barba Quinzenal" description="R$ 150/mês · cobrança todo dia 5" action={<Badge tone="success">Ativa</Badge>} />
          </Card>
        </TabPanel>
        <TabPanel value="dados" active={tab}>
          <Card tone="raised">
            <p className="text-sm text-fg-muted">Painel de &ldquo;Meus dados&rdquo;.</p>
          </Card>
        </TabPanel>
      </div>
    </Section>
  );
}

/* ── 9. Agenda ───────────────────────────────────────────────────────── */

const DEMO_DAYS: DayOption[] = [
  { value: '2026-08-17', weekday: 'SEG', day: 17, caption: 'ago' },
  { value: '2026-08-18', weekday: 'TER', day: 18, caption: 'ago' },
  { value: '2026-08-19', weekday: 'QUA', day: 19, caption: 'ago', soldOut: true },
  { value: '2026-08-20', weekday: 'QUI', day: 20, caption: 'ago' },
  { value: '2026-08-21', weekday: 'SEX', day: 21, caption: 'ago' },
  { value: '2026-08-22', weekday: 'SÁB', day: 22, caption: 'ago' },
  { value: '2026-08-23', weekday: 'DOM', day: 23, caption: 'Fechado', disabled: true },
  { value: '2026-08-24', weekday: 'SEG', day: 24, caption: 'ago' },
];

function ScheduleSection() {
  const [day, setDay] = useState<string | null>('2026-08-20');
  const [time, setTime] = useState<string | null>('16:30');
  const [loading, setLoading] = useState(false);

  return (
    <Section id="agenda" title="Agenda">
      <Card tone="raised" className="gap-5">
        <DatePicker days={DEMO_DAYS} value={day} onChange={setDay} />
        <TimeSlotGrid
          loading={loading}
          value={time}
          onChange={setTime}
          groups={[
            { label: 'MANHÃ', times: ['09:00', '09:45', '10:30', '11:15'] },
            { label: 'TARDE', times: ['14:00', '14:45', '15:30', '16:30'] },
            { label: 'NOITE', times: [] },
          ]}
        />
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 900);
          }}
        >
          Simular carregamento de slots
        </Button>
      </Card>
    </Section>
  );
}

/* ── 10. AppShell ────────────────────────────────────────────────────── */

export const DEMO_NAV: Omit<AppShellNavItem, 'onSelect'>[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <Icons.GridIcon size={19} /> },
  { key: 'agenda', label: 'Agenda', icon: <Icons.CalendarIcon size={19} /> },
  { key: 'clientes', label: 'Clientes', icon: <Icons.UsersIcon size={19} /> },
  { key: 'comandas', label: 'Comandas', icon: <Icons.ReceiptIcon size={19} /> },
  { key: 'financeiro', label: 'Financeiro', icon: <Icons.MoneyIcon size={19} /> },
  { key: 'comissoes', label: 'Comissões', icon: <Icons.PercentIcon size={19} />, locked: true },
  { key: 'fidelidade', label: 'Fidelidade', icon: <Icons.StarIcon size={19} /> },
  { key: 'whatsapp', label: 'WhatsApp', icon: <Icons.ChatIcon size={19} /> },
  { key: 'assistente-ia', label: 'Assistente IA', icon: <Icons.SparkleIcon size={19} />, badge: 'IA' },
  { key: 'relatorios', label: 'Relatórios', icon: <Icons.BarChartIcon size={19} /> },
  { key: 'servicos-produtos', label: 'Serviços & Produtos', icon: <Icons.ScissorsIcon size={19} /> },
  { key: 'equipe', label: 'Equipe', icon: <Icons.TeamIcon size={19} /> },
  { key: 'minha-pagina', label: 'Minha Página', icon: <Icons.GlobeIcon size={19} /> },
  { key: 'configuracoes', label: 'Configurações', icon: <Icons.SettingsIcon size={19} /> },
];

function AppShellSection() {
  return (
    <Section id="appshell" title="AppShell">
      <p className="text-[13px] text-fg-muted">
        A casca ocupa a viewport inteira, então mora numa rota própria:{' '}
        <a href="/app/playground/shell" className="font-semibold text-gold underline">
          /playground/shell
        </a>
        . Acima de <code className="text-gold">lg</code> a sidebar é fixa e recolhível; abaixo disso vira
        drawer sobreposto pelo botão de menu da topbar.
      </p>
    </Section>
  );
}

/* ── Página ──────────────────────────────────────────────────────────── */

export function Gallery() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-fg sm:text-3xl">
          Design system BarberVP
        </h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Todos os primitives de <code className="text-gold">packages/ui</code>. Cores, fontes, raios e
          animações vêm exclusivamente do preset em <code className="text-gold">packages/config</code>.
        </p>
      </header>

      <TokensSection />
      <AnimationsSection />
      <IconsSection />
      <ButtonsSection />
      <FieldsSection />
      <OverlaysSection />
      <FeedbackSection />
      <DataSection />
      <ScheduleSection />
      <AppShellSection />
    </div>
  );
}
