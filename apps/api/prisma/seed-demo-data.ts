/**
 * Dados do seed de DEMONSTRAÇÃO (`make seed-demo`) — nunca roda em produção.
 *
 * O seed base (`seed-data.ts`) é o mínimo do SPEC: catálogo, equipe do booking
 * e um punhado de linhas por módulo. Este arquivo é o volume que a auditoria
 * de tela precisa: 40 clientes, um mês de agenda, comandas suficientes para o
 * gráfico de faturamento encostar na meta e a distribuição que ACENDE cada
 * alerta do dashboard (inativos, aniversários, contas vencendo, caixa fechado).
 *
 * Regra deste arquivo: nada de data absoluta. Tudo é deslocamento relativo ao
 * dia da execução — o dashboard tem de parecer vivo rodando em qualquer dia.
 */

import type { BarberKey, ServiceKey } from './seed-data';

// ────────────────────────────────────────────────── Equipe (5º barbeiro) ────

/**
 * Maria Fernanda fecha os 5 barbeiros que a auditoria pede. Ela existe só no
 * seed demo: o SPEC fixa a equipe do booking em 4 (`agentes/SPEC.md` → Seed),
 * e o `make seed` continua entregando exatamente esses 4.
 */
export const DEMO_EXTRA_BARBER = {
  key: 'maria' as const,
  name: 'Maria Fernanda',
  specialty: 'Coloração e luzes',
  ratingBps: 495,
  phone: '5511987011122',
  email: 'maria.fernanda@barbeariacentral.com.br',
} as const;

export type DemoBarberKey = BarberKey | typeof DEMO_EXTRA_BARBER.key;

/**
 * Escala semanal de cada barbeiro. `dayOffIndex` é a POSIÇÃO na lista de dias
 * úteis disponíveis, não um `weekday` fixo: o dia de folga é escolhido em tempo
 * de execução excluindo os dias em que o seed base já plantou atendimento
 * (hoje, ontem-ish e amanhã), senão o demo nasceria com agenda em dia de folga.
 */
export const DEMO_SCHEDULES: Array<{
  barber: DemoBarberKey;
  startTime: number;
  endTime: number;
  lunchStart: number;
  lunchEnd: number;
  dayOffIndex: number;
}> = [
  // Os intervalos de almoço fogem dos horários que o seed base já ocupou hoje
  // (9h–16h45): almoço em cima de atendimento existente deixaria a agenda
  // mentindo já na primeira tela.
  { barber: 'carlos', startTime: 9 * 60, endTime: 19 * 60, lunchStart: 12 * 60, lunchEnd: 13 * 60, dayOffIndex: 0 },
  { barber: 'rafael', startTime: 9 * 60, endTime: 20 * 60, lunchStart: 12 * 60, lunchEnd: 13 * 60, dayOffIndex: 1 },
  { barber: 'diego', startTime: 9 * 60, endTime: 20 * 60, lunchStart: 12 * 60, lunchEnd: 13 * 60, dayOffIndex: 2 },
  { barber: 'bruno', startTime: 9 * 60, endTime: 18 * 60, lunchStart: 11 * 60, lunchEnd: 12 * 60, dayOffIndex: 3 },
  { barber: 'maria', startTime: 11 * 60, endTime: 20 * 60, lunchStart: 15 * 60, lunchEnd: 16 * 60, dayOffIndex: 4 },
];

/** Peso de cada barbeiro na distribuição de atendimentos (ranking da home). */
export const DEMO_BARBER_WEIGHTS: Record<DemoBarberKey, number> = {
  diego: 28,
  carlos: 24,
  rafael: 20,
  bruno: 16,
  maria: 12,
};

/** Convite de equipe ainda pendente — a linha "Convite enviado" da aba Equipe. */
export const DEMO_STAFF_INVITE = {
  name: 'Otávio Bandeira',
  email: 'otavio.bandeira@exemplo.com',
  phone: '5511987011133',
  /** Segredo em claro só no dev: vira `tokenHash` (HMAC) e o link é impresso. */
  secret: 'convite-demo-barbervp',
  services: ['corte', 'barba', 'corte-barba'] as ServiceKey[],
  workDays: [2, 3, 4, 5, 6],
} as const;

// ──────────────────────────────────────────────────────────── Produtos ──────

/**
 * Completa os 6 do seed base até os ~10 da auditoria. `stock` é o estoque
 * DEPOIS das vendas do mês (o seed grava o estado final, não o inicial), e
 * Pomada Argila + Talco ficam no mínimo de propósito: são eles que acendem o
 * card "estoque baixo" da home junto com os dois do seed base.
 */
export const DEMO_EXTRA_PRODUCTS = [
  { name: 'Pomada Argila Modeladora', priceCents: 5_200, costCents: 2_600, stock: 3, estoqueMin: 5, category: 'Cuidados' },
  { name: 'Talco Pós-Barba', priceCents: 2_400, costCents: 1_100, stock: 2, estoqueMin: 4, category: 'Cuidados' },
  { name: 'Gel Fixador 200ml', priceCents: 2_900, costCents: 1_300, stock: 18, estoqueMin: 5, category: 'Cuidados' },
  { name: 'Loção Tônica Capilar', priceCents: 5_900, costCents: 2_900, stock: 9, estoqueMin: 3, category: 'Cuidados' },
] as const;

// ──────────────────────────────────────────────────────────── Clientes ──────

/**
 * Segmento de cada cliente — é ele que decide o histórico gerado:
 *
 * · `inativo`    — última visita 35–120 dias atrás (alerta "clientes inativos");
 * · `mensalista` — vira `ClientSubscription` com uso parcial no ciclo;
 * · `faltoso`    — 2 faltas acumuladas (o ⚠ da agenda, ainda SEM bloqueio, que
 *                  só acontece na 3ª pelo `bloquearFaltasQtd`);
 * · `novo`       — primeira visita neste mês (KPI "novos clientes");
 * · `ativo`      — o resto, com visitas espalhadas pelos últimos 30 dias.
 */
export type DemoSegment = 'ativo' | 'inativo' | 'mensalista' | 'faltoso' | 'novo';

export interface DemoClientSeed {
  name: string;
  phone: string;
  email: string | null;
  segment: DemoSegment;
  /**
   * Aniversário como deslocamento em DIAS a partir de hoje (o ano é irrelevante,
   * a consulta do alerta compara só `MM-DD`). `0..6` cai na semana corrente e
   * acende o alerta de aniversariantes.
   */
  birthdayInDays: number;
  notes?: string;
}

/**
 * Os 30 que somam com os 10 do seed base = 40 clientes.
 *
 * A distribuição é a da auditoria: 12 inativos, 3 aniversariantes na semana,
 * 2 com duas faltas, 2 mensalistas (+3 do seed base = 5 assinantes).
 */
export const DEMO_CLIENTS: DemoClientSeed[] = [
  { name: 'Alexandre Moura', phone: '5511987651001', email: 'alexandre.moura@exemplo.com', segment: 'ativo', birthdayInDays: 41 },
  { name: 'Bernardo Cunha', phone: '5511987651002', email: null, segment: 'ativo', birthdayInDays: 58 },
  { name: 'Cláudio Rangel', phone: '5511987651003', email: 'claudio.rangel@exemplo.com', segment: 'inativo', birthdayInDays: 96 },
  { name: 'Diego Fontes', phone: '5511987651004', email: 'diego.fontes@exemplo.com', segment: 'ativo', birthdayInDays: 1, notes: 'Prefere tesoura, nunca máquina no topo.' },
  { name: 'Emerson Duarte', phone: '5511987651005', email: null, segment: 'inativo', birthdayInDays: 130 },
  { name: 'Fábio Queiroz', phone: '5511987651006', email: 'fabio.queiroz@exemplo.com', segment: 'faltoso', birthdayInDays: 77, notes: 'Já faltou duas vezes — confirmar por WhatsApp na véspera.' },
  { name: 'Gilberto Andrade', phone: '5511987651007', email: null, segment: 'inativo', birthdayInDays: 152 },
  { name: 'Hugo Bastos', phone: '5511987651008', email: 'hugo.bastos@exemplo.com', segment: 'mensalista', birthdayInDays: 63, notes: 'Assinante desde o começo do ano.' },
  { name: 'Ivan Peçanha', phone: '5511987651009', email: null, segment: 'ativo', birthdayInDays: 88 },
  { name: 'Jonas Vilela', phone: '5511987651010', email: 'jonas.vilela@exemplo.com', segment: 'inativo', birthdayInDays: 110 },
  { name: 'Kléber Tavares', phone: '5511987651011', email: 'kleber.tavares@exemplo.com', segment: 'ativo', birthdayInDays: 3 },
  { name: 'Leonardo Pires', phone: '5511987651012', email: null, segment: 'inativo', birthdayInDays: 171 },
  { name: 'Murilo Bastos', phone: '5511987651013', email: 'murilo.bastos@exemplo.com', segment: 'ativo', birthdayInDays: 36 },
  { name: 'Nelson Ribeiro', phone: '5511987651014', email: null, segment: 'inativo', birthdayInDays: 199 },
  { name: 'Otávio Camargo', phone: '5511987651015', email: 'otavio.camargo@exemplo.com', segment: 'ativo', birthdayInDays: 47 },
  { name: 'Paulo Sérgio Brito', phone: '5511987651016', email: null, segment: 'inativo', birthdayInDays: 214 },
  { name: 'Quirino Matos', phone: '5511987651017', email: 'quirino.matos@exemplo.com', segment: 'faltoso', birthdayInDays: 122, notes: 'Duas faltas seguidas; cobrar confirmação.' },
  { name: 'Renan Siqueira', phone: '5511987651018', email: 'renan.siqueira@exemplo.com', segment: 'mensalista', birthdayInDays: 69 },
  { name: 'Sérgio Bittencourt', phone: '5511987651019', email: null, segment: 'inativo', birthdayInDays: 233 },
  { name: 'Tadeu Marinho', phone: '5511987651020', email: 'tadeu.marinho@exemplo.com', segment: 'ativo', birthdayInDays: 52 },
  { name: 'Ulisses Franco', phone: '5511987651021', email: null, segment: 'inativo', birthdayInDays: 245 },
  { name: 'Valter Nogueira', phone: '5511987651022', email: 'valter.nogueira@exemplo.com', segment: 'ativo', birthdayInDays: 5 },
  { name: 'Wagner Pontes', phone: '5511987651023', email: null, segment: 'inativo', birthdayInDays: 258 },
  { name: 'Xavier Domingues', phone: '5511987651024', email: 'xavier.domingues@exemplo.com', segment: 'ativo', birthdayInDays: 91 },
  { name: 'Yuri Balbino', phone: '5511987651025', email: null, segment: 'inativo', birthdayInDays: 274 },
  { name: 'Zeca Almeida', phone: '5511987651026', email: 'zeca.almeida@exemplo.com', segment: 'ativo', birthdayInDays: 33 },
  { name: 'Adriano Vasques', phone: '5511987651027', email: null, segment: 'inativo', birthdayInDays: 289 },
  { name: 'Breno Cavalcanti', phone: '5511987651028', email: 'breno.cavalcanti@exemplo.com', segment: 'ativo', birthdayInDays: 118 },
  { name: 'César Portela', phone: '5511987651029', email: null, segment: 'ativo', birthdayInDays: 143 },
  { name: 'Danilo Esteves', phone: '5511987651030', email: 'danilo.esteves@exemplo.com', segment: 'novo', birthdayInDays: 160, notes: 'Chegou por indicação, primeira visita este mês.' },
];

// ──────────────────────────────────────────────────────────── Financeiro ────

/**
 * Duas contas a pagar dentro da semana — é o gatilho do alerta "contas
 * vencendo" da home (janela de hoje a +6 dias). O seed base tem uma só, e uma
 * conta sozinha não prova que o card conta certo.
 */
export const DEMO_EXTRA_PAYABLES = [
  { description: 'Lavanderia de toalhas', category: 'Outro', supplier: 'Lav & Cia', amountCents: 26_000, dueInDays: 2 },
  { description: 'Reposição de lâminas e navalhas', category: 'Produtos', supplier: 'Barber Supply Distribuidora', amountCents: 41_500, dueInDays: 4 },
] as const;

// ────────────────────────────────────────────────────────── Assistente IA ───

/** Conversa do "Navalha" já no histórico — a aba abre com contexto, não vazia. */
export const DEMO_AI_CONVERSATION: Array<{ user: string; assistant: string }> = [
  {
    user: 'Qual foi o faturamento da semana passada?',
    assistant:
      'A semana passada fechou com faturamento acima da média dos últimos 30 dias. O sábado puxou o resultado — foi o dia de maior movimento, com a agenda praticamente cheia nos cinco barbeiros.',
  },
  {
    user: 'Quais clientes estão sumidos há mais de um mês?',
    assistant:
      'Você tem 12 clientes sem visita há mais de 30 dias. Vale disparar a automação de reativação do WhatsApp para esse grupo — o template já está pronto, só ligar na aba WhatsApp.',
  },
  {
    user: 'Como está a ocupação da agenda hoje?',
    assistant:
      'A ocupação de hoje está saudável, com os horários da tarde mais disputados que os da manhã. Se quiser abrir espaço, o intervalo do começo da manhã é o mais livre.',
  },
  {
    user: 'Vale a pena aumentar o preço do Corte + Barba?',
    assistant:
      'O Corte + Barba é o serviço com maior participação no faturamento e sai R$ 10 abaixo da soma das partes. Um reajuste pequeno tende a passar sem atrito, mas acompanhe a taxa de retorno dos clientes nas quatro semanas seguintes.',
  },
  {
    user: 'Quem é o barbeiro com melhor desempenho no mês?',
    assistant:
      'O ranking da semana está no painel inicial, ordenado por faturamento. O topo se mantém estável há algumas semanas, com boa margem sobre o segundo colocado.',
  },
  {
    user: 'Preciso comprar produto de revenda?',
    assistant:
      'Sim — há produtos no estoque mínimo agora. A lista completa está em Serviços & Produtos, com o alerta em vermelho nos itens que precisam de reposição.',
  },
  {
    user: 'Como reduzir as faltas?',
    assistant:
      'Duas alavancas: manter o lembrete de 24h ligado (já está) e usar o bloqueio por faltas, hoje configurado em 3. Clientes com duas faltas aparecem com aviso na agenda — dá para confirmar por WhatsApp na véspera.',
  },
  {
    user: 'Quanto tenho a pagar esta semana?',
    assistant:
      'Há contas vencendo nos próximos dias, e o total aparece no alerta da tela inicial. A aba Financeiro → Contas a pagar mostra a lista com fornecedor e vencimento.',
  },
  {
    user: 'Meus assinantes estão usando o plano?',
    assistant:
      'Os assinantes ativos estão com uso parcial do ciclo — nenhum estourou a quota. A aba Fidelidade mostra o consumo de cada um no período corrente.',
  },
  {
    user: 'Qual o ticket médio atual?',
    assistant:
      'O ticket médio do mês está no card do painel inicial, com a variação em relação ao mês anterior. Comandas com produto agregado puxam o número para cima — vale sugerir produto no fechamento.',
  },
  {
    user: 'Consigo ver o relatório de ocupação por barbeiro?',
    assistant:
      'Consegue: Relatórios → período desejado traz faturamento por barbeiro, por serviço e a taxa de ocupação. O plano Avançado libera o relatório completo.',
  },
  {
    user: 'Obrigado!',
    assistant: 'Por nada. Quando quiser, é só chamar — estou aqui na aba do Assistente.',
  },
];

// ─────────────────────────────────────────────── Tenant secundário (demo) ───

/**
 * O tenant secundário existe para PROVAR isolamento com o olho: logar nele e
 * ver que nada da Barbearia Central aparece. Por isso ele precisa de dado em
 * cada módulo — e de um login próprio.
 *
 * Ele fica no Essencial de propósito: é o único lugar onde o limite de
 * barbeiros do plano (2) e a cota do Assistente IA (50 msgs/mês) podem ser
 * exercitados, já que o tenant demo assina o Avançado (ilimitado nos dois).
 */
/**
 * Calculadora de preço do tenant demo (`Dashboard.dc.html` l.4762, a fixture
 * `spCalcFixos`). Vive AQUI, no seed, e não no componente: a tela lê tudo da
 * API, e é este arquivo o lugar de qualquer número vindo do protótipo.
 *
 * Os parâmetros (comissão média, atendimentos, preço praticado) NÃO entram: o
 * `PriceCalculatorService` os deriva das regras de comissão, da produção dos
 * últimos 30 dias e do catálogo reais do tenant.
 */
export const DEMO_PRICE_CALC_FIXED_COSTS = [
  { name: 'Aluguel', amountCents: 250_000 },
  { name: 'Energia/água', amountCents: 45_000 },
  { name: 'Internet', amountCents: 12_000 },
  { name: 'Sistema', amountCents: 8_900 },
  { name: 'Marketing', amountCents: 30_000 },
  { name: 'Outros', amountCents: 20_000 },
] as const;

/** Custo de insumos por atendimento (`spCalcVariavel` do protótipo: R$ 4,50). */
export const DEMO_PRICE_CALC_VARIAVEL_CENTS = 450;

export const SECONDARY_TENANT = {
  ownerEmail: 'dono@barbeariaisolamento.com.br',
  ownerName: 'Heloísa Aragão',
  password: 'BarberVP@2026',
  barbers: [
    { name: 'Sandro Peixoto', specialty: 'Corte social' },
    { name: 'Vitória Lemos', specialty: 'Barboterapia' },
  ],
  services: [
    { name: 'Corte Simples', durationMin: 40, priceCents: 3_500, category: 'Cabelo' },
    { name: 'Barba Completa', durationMin: 30, priceCents: 3_000, category: 'Barba' },
    { name: 'Corte + Barba', durationMin: 65, priceCents: 6_000, category: 'Combo' },
    { name: 'Sobrancelha', durationMin: 15, priceCents: 1_800, category: 'Estética' },
  ],
  clients: [
    { name: 'Norberto Aguiar', phone: '5511987659001', email: 'norberto.aguiar@exemplo.com' },
    { name: 'Osvaldo Pimenta', phone: '5511987659002', email: null },
    { name: 'Priscila Damasceno', phone: '5511987659003', email: 'priscila.damasceno@exemplo.com' },
  ],
  product: { name: 'Shampoo Neutro 300ml', priceCents: 2_800, costCents: 1_200, stock: 2, estoqueMin: 4 },
  plan: { name: 'Plano Básico Mensal', description: '2 cortes por mês.', priceCents: 7_000 },
  payable: { description: 'Aluguel da sala', category: 'Aluguel', supplier: 'Condomínio Norte', amountCents: 120_000, dueInDays: 3 },
  receivable: { description: 'Mensalidade do plano', category: 'Mensalidade', customer: 'Norberto Aguiar', amountCents: 7_000, dueInDays: 5 },
  bankAccount: { name: 'Conta corrente', type: 'Pix / Transferência', balanceCents: 118_000 },
  aiMessages: 12,
} as const;
