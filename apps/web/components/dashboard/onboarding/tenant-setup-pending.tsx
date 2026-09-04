'use client';

import { Button, ScissorsIcon, useEstablishmentAuth } from '@barbervp/ui';

/**
 * O que o BARBEIRO vê quando entra numa barbearia cujo dono ainda não terminou
 * a configuração inicial.
 *
 * **Por que esta tela existe** (agente 30). Concluir o wizard é obrigatório
 * para acessar o painel, e o guard manda para `/app/configurar` todo membro de
 * um tenant pendente — mas o wizard é `@Roles('OWNER','MANAGER')`. Um barbeiro
 * convidado antes de o dono terminar caía numa tela que fazia `GET /onboarding`
 * e tomava 403: o produto o mandava para um lugar onde ele não podia entrar e
 * lhe mostrava "Não foi possível carregar o wizard" — um erro técnico para uma
 * situação que não tem nada de errado.
 *
 * As duas coisas que ele precisa saber estão aqui: não é problema dele, e é o
 * responsável quem destrava. E a única ação possível é a única oferecida.
 */
export function TenantSetupPending({ tenantName }: { tenantName: string | null }) {
  const { logout } = useEstablishmentAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-2xl bg-surface-2 text-gold"
      >
        <ScissorsIcon size={26} />
      </span>

      <div className="flex max-w-md flex-col gap-2.5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          A barbearia ainda está sendo configurada
        </h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">
          {tenantName ? <strong className="font-semibold text-fg">{tenantName}</strong> : 'Esta barbearia'}{' '}
          ainda não concluiu a configuração inicial — quem faz isso é o responsável pela conta.
          Assim que ele terminar, sua agenda aparece aqui.
        </p>
      </div>

      <Button variant="outline" onClick={() => void logout()}>
        Sair
      </Button>
    </div>
  );
}
