import type { PublicSaasPlan } from '@barbervp/types';

/**
 * Cópia de marketing da landing — textos EXATOS de `BarberVP Vendas.dc.html`.
 *
 * Fica aqui, e não no banco, porque é conteúdo editorial que muda por decisão
 * de marketing junto com o layout que o exibe (um depoimento novo costuma vir
 * com foto e posição nova). O que muda sozinho, sem deploy, é preço e bullet de
 * plano — e ESSE vem da API (`fetchSaasPlans`), nunca daqui.
 *
 * Regra 2 do SPEC (zero dado de negócio mockado no frontend) fala de dado de
 * negócio: plano, preço, limite. Nada disso está neste arquivo.
 */

export interface LandingStat {
  big: string;
  txt: string;
  /** Rodapé "Fonte: …" — vazio quando o número não tem fonte externa. */
  src: string;
}

export const STATS: readonly LandingStat[] = [
  {
    big: '74%',
    txt: 'dos brasileiros preferem agendar serviços pelo celular — barbearias com agendamento online reportam até 30% mais clientes',
    src: 'Sebrae',
  },
  {
    big: '−70%',
    txt: 'de faltas com lembretes automáticos enviados via WhatsApp',
    src: 'média de mercado',
  },
  {
    big: '+83%',
    txt: 'é quanto barbeiros com clientes assinantes faturam a mais (R$4.805 vs R$2.625/mês)',
    src: '',
  },
  {
    big: '2,5×',
    txt: 'é quanto o cliente assinante gasta a mais por ano (R$900 vs R$360)',
    src: '',
  },
] as const;

export interface LandingFeature {
  /** Glifo do protótipo — decisão de fidelidade visual, não lib de ícones. */
  icon: string;
  title: string;
  description: string;
}

export const FEATURES: readonly LandingFeature[] = [
  {
    icon: '◷',
    title: 'Agendamento online 24h',
    description: 'Seus clientes reservam a qualquer hora, sem ligações nem WhatsApp travado.',
  },
  {
    icon: '▦',
    title: 'Dashboard financeiro completo',
    description: 'Entradas, saídas, formas de pagamento e fechamento de caixa num só lugar.',
  },
  {
    icon: '٪',
    title: 'Comissões automáticas',
    description: 'Cada serviço gera a comissão do barbeiro automaticamente. Zero planilha.',
  },
  {
    icon: '✦',
    title: 'Página pública profissional',
    description: 'Uma vitrine bonita com serviços, equipe e avaliações — pronta em minutos.',
  },
  {
    icon: '★',
    title: 'Clube de assinaturas',
    description: 'Receita recorrente com assinaturas de clientes — exclusivo do plano Avançado.',
  },
  {
    icon: '◳',
    title: 'Relatórios e métricas',
    description: 'Ocupação, ticket médio, retorno de clientes e no-show sempre à mão.',
  },
  {
    icon: '✺',
    title: 'Assistente IA',
    description: 'Um assistente de IA para atendimento e organização, incluído em todos os planos.',
  },
] as const;

export interface LandingStep {
  n: string;
  title: string;
  description: string;
}

export const STEPS: readonly LandingStep[] = [
  { n: '1', title: 'Cadastre sua barbearia', description: 'Crie sua conta grátis em 1 minuto, sem cartão.' },
  { n: '2', title: 'Personalize sua página', description: 'Adicione logo, fotos, serviços, preços e sua equipe.' },
  { n: '3', title: 'Receba agendamentos', description: 'Compartilhe seu link. Os clientes agendam sozinhos, 24h por dia.' },
  { n: '4', title: 'Acompanhe no dashboard', description: 'Faturamento, agenda, comissões e métricas em tempo real.' },
] as const;

export interface LandingTestimonial {
  metric: string;
  quote: string;
  name: string;
  shop: string;
  /** Matiz do gradiente radial do avatar (o protótipo não tem foto real). */
  hue: number;
}

export const TESTIMONIALS: readonly LandingTestimonial[] = [
  {
    metric: '+118% de faturamento',
    quote: 'Dobrei meu faturamento em 3 meses. Parei de perder cliente por não atender o telefone.',
    name: 'Anderson Reis',
    shop: 'Barba & Cia · Curitiba',
    hue: 30,
  },
  {
    metric: '−65% de faltas',
    quote: 'O lembrete automático no WhatsApp acabou com os furos na agenda. Mudou meu mês.',
    name: 'Tiago Moura',
    shop: 'Studio TM · Recife',
    hue: 24,
  },
  {
    metric: 'R$ 6.200/mês recorrente',
    quote: 'O clube de assinatura trouxe uma renda fixa que eu nunca tive antes. Recomendo demais.',
    name: 'Felipe Nogueira',
    shop: 'Old Town Barber · Porto Alegre',
    hue: 40,
  },
] as const;

export interface LandingFaq {
  q: string;
  a: string;
}

/**
 * Preço curto para texto corrido: "R$ 89" e não "R$ 89,00".
 *
 * O card mostra os centavos (é uma tabela de preços, o alinhamento importa); a
 * frase do FAQ os omite quando são zero, como no protótipo. Plano de R$ 89,90
 * volta a mostrá-los — omitir ali seria mentir sobre o preço.
 */
function shortPrice(priceCents: number): string {
  const reais = priceCents / 100;
  return Number.isInteger(reais)
    ? `R$ ${reais.toLocaleString('pt-BR')}`
    : `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const COUNT_WORDS: Record<number, string> = {
  1: 'um',
  2: 'dois',
  3: 'três',
  4: 'quatro',
  5: 'cinco',
  6: 'seis',
};

/** "a, b e c" — a vírgula-e do português, que `join` não faz. */
function humanJoin(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * As seis perguntas do protótipo, com preço e limite de barbeiros vindos da API.
 *
 * Duas das respostas citam números de plano ("Essencial (R$ 49)…", "atende até
 * 2 barbeiros"). Deixá-las como texto fixo era repetir dado de negócio no
 * frontend — a landing mostraria R$ 89 no card e R$ 49 no FAQ no dia em que
 * alguém mexesse no preço pelo super admin. Com os planos semeados o texto sai
 * palavra por palavra igual ao protótipo; sem eles (API fora) cai numa versão
 * sem números, que continua verdadeira.
 */
export function buildFaqs(plans: readonly PublicSaasPlan[]): LandingFaq[] {
  const priceLine =
    plans.length > 0
      ? `São ${COUNT_WORDS[plans.length] ?? plans.length} planos mensais — ${humanJoin(
          plans.map((plan) => `${plan.name} (${shortPrice(plan.priceCents)})`),
        )}.`
      : 'Os planos são mensais.';

  const limited = plans.filter((plan) => plan.maxBarbers !== null);
  const unlimited = plans.filter((plan) => plan.maxBarbers === null);
  const limitLine = limited.length > 0
    ? `O ${limited[0]!.name} atende até ${limited[0]!.maxBarbers} barbeiros${
        limited.length > 1
          ? ` e o ${limited[1]!.name} até ${limited[1]!.maxBarbers}`
          : ''
      }.`
    : '';
  const unlimitedLine =
    unlimited.length > 0 ? ` No ${unlimited[0]!.name} os barbeiros são ilimitados.` : '';

  return [
    {
      q: 'Preciso de cartão para testar?',
      a: 'Não. São 7 dias grátis, sem cartão. Você só cadastra a forma de pagamento se decidir assinar ao final do teste.',
    },
    {
      q: 'Como funciona o preço?',
      a: `${priceLine} Cada um libera um conjunto de funcionalidades e um limite de barbeiros. Você pode mudar de plano a qualquer momento direto no painel.`,
    },
    {
      q: 'Posso cancelar quando quiser?',
      a: 'Pode. Não há fidelidade nem multa. O cancelamento é feito em poucos cliques dentro do próprio painel, e você mantém acesso até o fim do ciclo já pago.',
    },
    {
      q: 'O que acontece se eu adicionar mais profissionais?',
      a: `${limitLine} Ao atingir o limite, o painel sugere o upgrade — a mudança de plano é feita em poucos cliques e vale imediatamente.${unlimitedLine}`.trim(),
    },
    {
      q: 'Meus dados e os dos meus clientes ficam seguros?',
      a: 'Sim. Todos os dados são criptografados e armazenados em servidores seguros, em conformidade com a LGPD. Você é o dono dos seus dados e pode exportá-los quando quiser.',
    },
    {
      q: 'Já uso outra agenda. Dá para migrar?',
      a: 'Dá. Durante o teste você pode importar sua lista de clientes e nossa equipe ajuda na configuração inicial sem custo.',
    },
  ];
}

/** Âncoras das seções — a nav e o `scrollTo` dependem de bater com o `id` real. */
export const SECTION_IDS = {
  features: 'bvp-features',
  how: 'bvp-how',
  plans: 'bvp-plans',
  faq: 'bvp-faq',
} as const;

export const NAV_LINKS = [
  { id: SECTION_IDS.features, label: 'Funcionalidades' },
  { id: SECTION_IDS.how, label: 'Como funciona' },
  { id: SECTION_IDS.plans, label: 'Planos' },
  { id: SECTION_IDS.faq, label: 'Dúvidas' },
] as const;

/**
 * Plano pré-selecionado nos CTAs que não saem de um card específico (hero,
 * CTA final, botão da nav). O protótipo mandava `'pro'` para um wizard que
 * ignorava o valor; aqui vira `?plano=` de verdade, então tem de ser um `code`
 * que existe no banco.
 */
export const DEFAULT_PLAN_ID = 'profissional';

export function signupHref(planId: string = DEFAULT_PLAN_ID): string {
  return `/cadastro?plano=${encodeURIComponent(planId)}`;
}
