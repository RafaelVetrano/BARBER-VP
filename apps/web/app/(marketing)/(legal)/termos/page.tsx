import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalList, LegalSection, LegalTitle } from '../legal-prose';

/**
 * Termos de Uso.
 *
 * Mesmo critério da Política de Privacidade: só afirma o que o produto faz
 * hoje. O ciclo de cobrança, o teto de barbeiros por plano, a suspensão por
 * inadimplência e a janela de 30 dias da exclusão são todos comportamentos
 * implementados — não promessas.
 */
export const metadata: Metadata = {
  title: 'Termos de Uso',
  description:
    'As regras de uso do BarberVP: contratação, planos e cobrança, responsabilidades da barbearia e do cliente, e como encerrar a conta.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/termos' },
};

export default function TermosPage() {
  return (
    <>
      <LegalTitle updatedAt="3 de setembro de 2026">Termos de Uso</LegalTitle>

      <LegalSection title="O que você está contratando">
        <p>
          O BarberVP é um software de gestão para barbearias, oferecido como serviço pela internet.
          Ele organiza agenda, clientes, comandas, caixa, comissões e a comunicação com quem
          agenda. Ao criar uma conta ou usar o sistema, você concorda com estes termos.
        </p>
        <p>
          Estes termos valem para dois públicos: a <strong className="text-fg">barbearia</strong>{' '}
          que assina o serviço (e sua equipe) e o{' '}
          <strong className="text-fg">cliente final</strong> que agenda pelo link público. Onde a
          regra for de só um deles, está dito.
        </p>
      </LegalSection>

      <LegalSection title="Conta e responsabilidade">
        <LegalList
          items={[
            <>
              Os dados do cadastro precisam ser verdadeiros e atualizados. A conta é pessoal: quem
              tem a senha responde pelo que for feito com ela.
            </>,
            <>
              O dono da barbearia decide quem entra na equipe e com qual papel. Cada papel enxerga
              o que lhe cabe — um barbeiro vê a própria agenda e as próprias comissões, não o
              financeiro da casa.
            </>,
            <>
              Suspeitou de acesso indevido? Troque a senha. Isso encerra as outras sessões
              imediatamente.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Planos, cobrança e limites">
        <LegalList
          items={[
            <>
              A assinatura é mensal e recorrente, no plano escolhido pela barbearia. Cada plano tem
              um teto de profissionais e um conjunto de recursos; o sistema mostra o que está fora
              do plano em vez de esconder.
            </>,
            <>
              A troca de plano vale a partir da confirmação. Ao migrar para um plano com teto menor,
              os profissionais acima do limite são marcados como inativos — eles não somem, deixam
              de aparecer na agenda e de receber novos agendamentos até um upgrade.
            </>,
            <>
              Pagamento recusado gera novas tentativas. Persistindo a inadimplência, o acesso pode
              ser suspenso; os dados continuam guardados e voltam quando a pendência é resolvida.
            </>,
            <>Preços podem mudar, sempre com aviso antes do ciclo seguinte.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Agendamentos: o que é da barbearia e o que é nosso">
        <p>
          O BarberVP registra e organiza os agendamentos. Quem presta o serviço é a barbearia. Preço,
          duração, política de cancelamento, atraso e falta são definidos por ela, dentro do próprio
          sistema — e é com ela que se resolve qualquer questão sobre o atendimento em si.
        </p>
        <p>
          A barbearia pode exigir antecedência mínima para agendar online e bloquear o agendamento
          online de quem acumula faltas. As duas regras são configuráveis por ela, e o cliente
          bloqueado continua podendo marcar falando diretamente com a barbearia.
        </p>
      </LegalSection>

      <LegalSection title="Uso aceitável">
        <p>Não é permitido usar o BarberVP para:</p>
        <LegalList
          items={[
            <>Atividade ilícita, ou oferta de serviço que a lei não permita.</>,
            <>
              Enviar mensagem em massa a quem não consentiu, ou usar a base de clientes de uma
              barbearia fora do relacionamento dela com esses clientes.
            </>,
            <>
              Tentar acessar dados de outra barbearia, testar limites de segurança sem autorização,
              ou automatizar acesso de forma a degradar o serviço para os demais.
            </>,
            <>Revender ou sublicenciar o acesso sem acordo escrito.</>,
          ]}
        />
        <p>
          Uso assim pode levar à suspensão da conta. Em caso grave, à rescisão — com o aviso que a
          situação permitir.
        </p>
      </LegalSection>

      <LegalSection title="De quem são os dados">
        <p>
          Os dados que a barbearia cadastra continuam sendo dela. Não os usamos para outra
          finalidade que não seja operar o serviço para ela, e ela pode exportá-los a qualquer
          momento. O software, a marca e o design do BarberVP continuam sendo nossos — a assinatura
          dá direito de uso, não de propriedade.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidade e limites">
        <p>
          Trabalhamos para manter o serviço no ar, mas ele depende de infraestrutura de terceiros e
          pode ter interrupções — programadas, com aviso, ou não. Não respondemos por lucros
          cessantes nem por decisões comerciais tomadas com base nos relatórios do sistema; a
          conferência dos números é da barbearia.
        </p>
        <p>
          As mensagens de WhatsApp dependem de a operadora e a plataforma entregarem, e de o número
          do destinatário estar correto. Um lembrete não entregue não transfere para nós a
          responsabilidade pelo comparecimento.
        </p>
      </LegalSection>

      <LegalSection title="Encerrar a conta">
        <LegalList
          items={[
            <>
              A barbearia pode cancelar quando quiser, em{' '}
              <em>Meu perfil → Privacidade e dados</em>. A exclusão é{' '}
              <strong className="text-fg">agendada com 30 dias</strong>: a assinatura é cancelada na
              hora e, dentro da janela, basta entrar normalmente para desistir. Vencido o prazo, os
              dados são apagados de forma definitiva. Exporte o que precisar antes.
            </>,
            <>
              O cliente final encerra a própria conta em <em>Minha conta → Privacidade</em>, com
              anonimização dos dados pessoais.
            </>,
            <>
              Podemos encerrar a prestação por descumprimento destes termos ou por inadimplência
              prolongada, preservando o prazo de exportação sempre que possível.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Mudanças nestes termos">
        <p>
          Se algo mudar de forma relevante, avisamos antes de valer. Continuar usando o serviço
          depois disso significa concordar com a nova versão. A data no topo desta página diz qual
          é a versão vigente.
        </p>
      </LegalSection>

      <LegalSection title="Lei aplicável e contato">
        <p>
          Estes termos são regidos pela lei brasileira. Dúvidas, pedidos e reclamações:{' '}
          <a href="mailto:contato@barbervp.com.br" className="text-gold hover:underline">
            contato@barbervp.com.br
          </a>
          .
        </p>
        <p>
          Veja também a{' '}
          <Link href="/privacidade" className="text-gold hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </LegalSection>
    </>
  );
}
