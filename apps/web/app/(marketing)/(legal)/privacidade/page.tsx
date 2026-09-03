import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalSection, LegalTitle } from '../legal-prose';

/**
 * Política de Privacidade.
 *
 * Escrita contra o que o produto REALMENTE faz — nada de cláusula sobre
 * integração que o v1 não tem. Cada afirmação daqui tem um endpoint, uma
 * coluna do schema ou uma constante de retenção por trás:
 *
 *  · exportação e exclusão do cliente → `GET /client-auth/me/export` e
 *    `POST /client-auth/me/delete` (fase 05);
 *  · exclusão da conta da barbearia → `Tenant.purgeAt`, janela de 30 dias
 *    (agente 27);
 *  · retenção → `RETENTION_DAYS` em `maintenance.service.ts` (OTP 7 dias,
 *    sessão 30, mensagens 30, auditoria 365).
 */
export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description:
    'Como o BarberVP trata os dados de barbearias e de seus clientes: o que é coletado, por quê, por quanto tempo e como pedir exportação ou exclusão.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacidade' },
};

export default function PrivacidadePage() {
  return (
    <>
      <LegalTitle updatedAt="3 de setembro de 2026">Política de Privacidade</LegalTitle>

      <LegalSection title="Quem é quem nesta política">
        <p>
          O BarberVP é um sistema de gestão usado por barbearias. Isso cria duas relações
          diferentes, e vale saber em qual você está:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-fg">A barbearia</strong> contrata o BarberVP e decide quais
              dados de clientes registra. Sobre esses dados, ela é a <em>controladora</em>: é dela a
              decisão do que coletar e para quê.
            </>,
            <>
              <strong className="text-fg">O BarberVP</strong> guarda e processa esses dados a pedido
              da barbearia — é o <em>operador</em>. Não vendemos, não alugamos e não usamos a base
              de clientes de uma barbearia para nada além de fazer o sistema funcionar para ela.
            </>,
            <>
              <strong className="text-fg">Você, cliente da barbearia</strong>, tem conta própria na
              plataforma e um perfil separado em cada barbearia que frequenta. Uma barbearia nunca
              enxerga o seu histórico em outra.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Que dados coletamos">
        <p>Só o necessário para agendar, atender e cobrar. Na prática:</p>
        <LegalList
          items={[
            <>
              <strong className="text-fg">Cadastro:</strong> nome, telefone (WhatsApp) e, quando
              você informa, e-mail e data de nascimento. O telefone é o identificador principal
              porque é por ele que a barbearia te reconhece no balcão.
            </>,
            <>
              <strong className="text-fg">Agendamentos:</strong> data, horário, serviços, o
              profissional que atende, o valor e as observações que a barbearia anotar.
            </>,
            <>
              <strong className="text-fg">Atendimentos e pagamentos:</strong> o que foi consumido, a
              forma de pagamento e o valor. Não recebemos nem armazenamos número de cartão.
            </>,
            <>
              <strong className="text-fg">Fidelidade e assinaturas,</strong> quando a barbearia usa:
              saldo de pontos e uso do plano no ciclo.
            </>,
            <>
              <strong className="text-fg">Dados técnicos de segurança:</strong> endereço IP e
              identificação do navegador nos registros de auditoria e de sessão, para detectar uso
              indevido de conta.
            </>,
          ]}
        />
        <p>
          Não coletamos dados sensíveis (origem racial, saúde, biometria, convicção religiosa ou
          política) e não temos publicidade nem rastreadores de terceiros nas telas do produto.
        </p>
      </LegalSection>

      <LegalSection title="Por que tratamos cada dado">
        <LegalList
          items={[
            <>
              <strong className="text-fg">Executar o serviço:</strong> agendar, lembrar, atender e
              cobrar são a razão de você ter entrado.
            </>,
            <>
              <strong className="text-fg">Cumprir obrigação legal:</strong> registros fiscais e a
              trilha de auditoria de ações sensíveis.
            </>,
            <>
              <strong className="text-fg">Legítimo interesse:</strong> segurança da conta,
              prevenção a fraude e abuso do agendamento online.
            </>,
            <>
              <strong className="text-fg">Consentimento:</strong> as mensagens de WhatsApp que não
              são sobre um agendamento seu — aniversário, reativação, pedido de avaliação. Você pode
              desligá-las sem perder nada do resto.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Mensagens que você recebe">
        <p>
          As mensagens transacionais — confirmação, lembrete e aviso de cancelamento — fazem parte
          do agendamento. As de relacionamento dependem da sua permissão e podem ser desligadas a
          qualquer momento nas preferências da sua conta ou pedindo à barbearia.
        </p>
      </LegalSection>

      <LegalSection title="Por quanto tempo guardamos">
        <p>
          Cada tipo de dado tem prazo próprio, e a limpeza é automática — não depende de alguém
          lembrar:
        </p>
        <LegalList
          items={[
            <>Códigos de verificação e links de recuperação de senha: 7 dias.</>,
            <>Sessões de login já expiradas: 30 dias.</>,
            <>Histórico de mensagens enviadas: 30 dias.</>,
            <>
              Registros de auditoria (quem fez o quê no sistema): 365 dias — é o prazo de
              conformidade, e são justamente eles que permitem demonstrar quem acessou o quê.
            </>,
            <>
              Histórico de atendimento e registros financeiros: enquanto a barbearia mantiver a
              conta ativa, e depois pelo prazo que a legislação fiscal exigir.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Seus direitos, e onde eles ficam na tela">
        <p>
          A LGPD garante acesso, correção, portabilidade e exclusão. No BarberVP eles não são um
          formulário de e-mail: estão dentro do produto, dos dois lados.
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-fg">Cliente:</strong> em <em>Minha conta → Privacidade</em>{' '}
              você exporta todo o seu histórico em um arquivo e pode excluir a conta. Na exclusão,
              seus dados pessoais são anonimizados; os registros de venda permanecem sem
              identificação, porque a barbearia precisa deles para a própria contabilidade.
            </>,
            <>
              <strong className="text-fg">Barbearia:</strong> em <em>Meu perfil → Privacidade e
              dados</em> o dono exporta os dados da conta e pode excluí-la. A exclusão é agendada
              com <strong className="text-fg">30 dias</strong> de prazo — dá para desistir dentro da
              janela entrando normalmente. Vencido o prazo, os dados são apagados de vez.
            </>,
            <>
              <strong className="text-fg">Funcionário:</strong> o barbeiro solicita a exclusão dos
              próprios dados pela mesma tela, e o pedido vai para a administração da barbearia.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Com quem os dados são compartilhados">
        <p>
          Com quem é preciso para o sistema funcionar: o provedor de hospedagem e banco de dados, o
          provedor de mensageria que entrega o WhatsApp e o processador de pagamentos da assinatura
          da barbearia. Nenhum deles recebe mais do que precisa para a própria função, e nenhum
          recebe dados para uso próprio.
        </p>
        <p>Não vendemos dados pessoais. Nunca.</p>
      </LegalSection>

      <LegalSection title="Segurança">
        <p>
          Senhas são guardadas com hash moderno, nunca em texto puro. O acesso é por sessão curta
          com renovação, e cada barbearia é isolada das demais no banco — um teste automatizado
          tenta atravessar essa fronteira a cada mudança de código, e o sistema não é publicado se
          ele passar. Ações sensíveis ficam registradas com autor, data e origem.
        </p>
      </LegalSection>

      <LegalSection title="Falar com a gente">
        <p>
          Dúvida sobre esta política, ou um pedido que a tela não resolve: escreva para{' '}
          <a href="mailto:privacidade@barbervp.com.br" className="text-gold hover:underline">
            privacidade@barbervp.com.br
          </a>
          . Se o assunto for o seu histórico em uma barbearia específica, fale também com ela — é
          quem decide o que registrar sobre você.
        </p>
        <p>
          Veja também os{' '}
          <Link href="/termos" className="text-gold hover:underline">
            Termos de Uso
          </Link>
          .
        </p>
      </LegalSection>
    </>
  );
}
