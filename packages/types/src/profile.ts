/**
 * "Meu perfil" — a tela da PESSOA logada (`Dashboard.dc.html` l.2737–2817 para
 * o dono/gerente, `DashboardFuncionario.dc.html` l.776–845 para o barbeiro).
 *
 * Não confundir com Configurações, que é da BARBEARIA: aqui nada é escopado
 * por tenant a não ser o papel, e é justamente o papel que decide quais dos
 * quatro blocos do desenho aparecem.
 */

import type { MembershipRole } from './enums';

/** Selo ao lado do nome (l.2752 "Proprietário", l.789 "Barbeiro"). */
export const ROLE_BADGE_LABEL: Record<MembershipRole, string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  BARBER: 'Barbeiro',
};

/**
 * Janela entre pedir a exclusão da conta e a faxina apagar de vez — os "30
 * dias para reativar a conta" que o próprio modal promete (l.3527).
 *
 * Mora no contrato compartilhado porque os dois lados a anunciam: o servidor
 * calcula o `purgeAt` com ela, e a tela usa o mesmo número na frase do modal —
 * assim o texto nunca promete um prazo diferente do que o banco vai cumprir.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Palavra que o passo 2 do `modalExcluirConta` exige por extenso (l.3538). */
export const ACCOUNT_DELETION_CONFIRM_WORD = 'EXCLUIR';

/**
 * O que a tela carrega de uma vez.
 *
 * Os três `can*` são a MESMA decisão que o servidor aplica nos endpoints — a
 * tela não os recalcula a partir do papel. Esconder um bloco é cortesia; o
 * 403 é a barreira (regra 3), e um só lugar decidindo evita que os dois lados
 * discordem sobre quem pode o quê.
 */
export interface MyProfile {
  id: string;
  name: string;
  email: string;
  /** E.164 sem formatação, ou `null`. A tela aplica a máscara. */
  phone: string | null;
  avatarUrl: string | null;
  role: MembershipRole;
  roleLabel: string;
  tenantName: string;
  /**
   * `false` para o barbeiro: o nome dele é o da ficha da Equipe, mantida pela
   * administração da barbearia (l.798). O campo aparece travado, com a frase.
   */
  canEditName: boolean;
  /** `false` para o barbeiro — o desenho dele não tem "Alterar foto". */
  canUploadAvatar: boolean;
  /** Só o dono exclui a barbearia; os demais SOLICITAM ao dono (l.840). */
  canDeleteAccount: boolean;
  /** Preenchido enquanto houver exclusão agendada; `null` no caso normal. */
  scheduledDeletion: ScheduledDeletion | null;
}

export interface ScheduledDeletion {
  /** ISO — quando a faxina apaga a barbearia de vez. */
  purgeAt: string;
  /** Dias inteiros que ainda restam para desistir (mínimo 0). */
  daysLeft: number;
}

export interface UpdateMyProfileDto {
  name?: string;
  email?: string;
  /** String vazia limpa o telefone. */
  phone?: string | null;
}

export interface RequestAccountDeletionDto {
  /** Tem de ser exatamente `ACCOUNT_DELETION_CONFIRM_WORD`. */
  confirm: string;
}

/** Exportação LGPD (art. 18 IV/V) do login de estabelecimento. */
export interface ExportedUserData {
  exportedAt: string;
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    emailVerifiedAt: string | null;
    hasClientAccount: boolean;
  };
  memberships: Array<{
    tenantName: string;
    tenantSlug: string;
    role: MembershipRole;
    since: string;
  }>;
  /** Ficha de barbeiro, quando este login atende como profissional. */
  barberProfiles: Array<{
    tenantName: string;
    name: string;
    specialty: string | null;
    email: string | null;
    phone: string | null;
    hiredAt: string | null;
    active: boolean;
  }>;
  /** Sessões abertas — dispositivo e validade, sem token nenhum. */
  sessions: Array<{
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    userAgent: string | null;
    ip: string | null;
  }>;
  /** Trilha das próprias ações, no limite de retenção do `AuditLog`. */
  activity: Array<{
    action: string;
    entity: string;
    createdAt: string;
    ip: string | null;
  }>;
}
