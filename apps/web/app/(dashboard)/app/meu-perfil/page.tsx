'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  Card,
  ChevronLeftIcon,
  Input,
  PasswordInput,
  Skeleton,
  authErrorMessage,
  cn,
  establishmentApi,
  isPasswordValid,
  maskPhoneInput,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { MembershipRole, formatPhone } from '@barbervp/types';
import type { MyProfile } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { BlockError } from '@/components/dashboard/blocks';
import { DataDeletionModal } from '@/components/dashboard/profile/data-deletion-modal';
import { DeleteAccountModal } from '@/components/dashboard/profile/delete-account-modal';
import {
  MY_PROFILE_KEY,
  useCancelAccountDeletionMutation,
  useExportMyDataMutation,
  useMyProfileQuery,
  useRemoveAvatarMutation,
  useUpdateMyProfileMutation,
  useUploadAvatarMutation,
} from '@/lib/dashboard/api/profile';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Botão de contorno vermelho — `border:1px solid #E05B5B` + texto vermelho
 * (l.2811 e l.840). O design system tem `danger` só na versão sólida, usada
 * nos modais; aqui o desenho pede o contorno, e as classes vencem o `outline`
 * pelo `twMerge` do `cn`.
 */
const DANGER_OUTLINE = 'border-danger text-danger hover:border-danger hover:bg-danger/10 hover:text-danger';

/**
 * "Meu perfil" — `Dashboard.dc.html` l.2737–2817 (dono/gerente) e
 * `DashboardFuncionario.dc.html` l.776–845 (barbeiro).
 *
 * Uma tela, dois recortes. O desenho do funcionário não é outra página: é a
 * MESMA, com o nome travado, sem "Alterar foto", com "Solicitar exclusão" no
 * lugar de "Excluir minha conta" e sem o bloco vermelho. Quem decide isso são
 * os `can*` de `GET /me`, que são o espelho do que o servidor aceita — a tela
 * não recalcula permissão a partir do papel (regra 3 e regra 5).
 *
 * Não confundir com Configurações: lá é o TENANT, aqui é a PESSOA.
 */
export default function MeuPerfilPage() {
  const profileQuery = useMyProfileQuery();

  return (
    <DashboardChrome activeKey="meu-perfil">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <BackToDashboard />

        {profileQuery.isLoading && <ProfileSkeleton />}
        {profileQuery.isError && (
          <BlockError label="seu perfil" onRetry={() => void profileQuery.refetch()} />
        )}
        {profileQuery.data && <ProfileScreen profile={profileQuery.data} />}
      </div>
    </DashboardChrome>
  );
}

/** "‹ Voltar ao dashboard" (l.2740) — fora dos cards, no topo da coluna. */
function BackToDashboard() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/app')}
      className="-ml-2 flex h-11 w-fit items-center gap-2 rounded-control px-2 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-8"
    >
      <ChevronLeftIcon size={16} />
      Voltar ao dashboard
    </button>
  );
}

/** Esqueleto na altura dos blocos finais — carregar não pode empurrar layout. */
function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-[368px] rounded-xl" />
      <Skeleton className="h-[326px] rounded-xl" />
      <Skeleton className="h-[150px] rounded-xl" />
    </div>
  );
}

function ProfileScreen({ profile }: { profile: MyProfile }) {
  return (
    <>
      <PersonalDataCard profile={profile} />
      <SecurityCard />
      <PrivacyCard profile={profile} />
      {profile.canDeleteAccount && <DangerZoneCard profile={profile} />}
    </>
  );
}

// ── Dados pessoais (l.2745–2774) ────────────────────────────────────────────

function PersonalDataCard({ profile }: { profile: MyProfile }) {
  const { toast } = useToast();
  const update = useUpdateMyProfileMutation();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState('');

  /*
   * Reidrata SÓ quando os valores do servidor mudam de verdade.
   *
   * O objeto `profile` troca de identidade a cada escrita no cache — e o
   * upload de foto é uma delas. Reagindo ao objeto, trocar a foto no meio de
   * uma edição apagaria o nome digitado e ainda não salvo. Comparando o
   * conteúdo, a foto passa sem tocar no formulário, e uma mudança real (o
   * PATCH que voltou, ou a troca de barbearia no seletor de contexto)
   * continua reidratando.
   */
  const hydrated = useRef('');
  useEffect(() => {
    const snapshot = `${profile.name}\u0000${profile.email}\u0000${profile.phone ?? ''}`;
    if (hydrated.current === snapshot) return;
    hydrated.current = snapshot;
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone ? maskPhoneInput(formatPhone(profile.phone)) : '');
  }, [profile]);

  const save = async () => {
    try {
      await update.mutateAsync({
        // O nome só entra no corpo quando o papel permite editá-lo: mandar o
        // campo travado de volta faria o servidor comparar e recusar à toa.
        ...(profile.canEditName ? { name: name.trim() } : {}),
        email: email.trim(),
        phone: phone.trim(),
      });
      toast({ message: 'Perfil atualizado com sucesso.', tone: 'success' });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível salvar.'), tone: 'danger' });
    }
  };

  const canSubmit = name.trim().length >= 2 && email.trim().length > 0;

  return (
    <Card className="gap-[18px] p-5">
      <h2 className="font-display text-[15px] font-semibold text-fg">Dados pessoais</h2>

      <div className="flex items-center gap-4">
        <AvatarBlock profile={profile} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{profile.name}</span>
            <span className="rounded-[20px] bg-gold/15 px-2.5 py-[3px] text-[11px] font-semibold text-gold">
              {profile.roleLabel}
            </span>
          </div>
          {profile.canUploadAvatar && <AvatarActions profile={profile} />}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <Input
          label="Nome"
          value={name}
          disabled={!profile.canEditName}
          hint={profile.canEditName ? undefined : 'Gerenciado pela administração da barbearia'}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="WhatsApp"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 9 9999-9999"
          value={phone}
          onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} loading={update.isPending} onClick={() => void save()}>
          Salvar alterações
        </Button>
      </div>
    </Card>
  );
}

/** Círculo de 56px com borda dourada — foto quando existe, iniciais quando não. */
function AvatarBlock({ profile }: { profile: MyProfile }) {
  return (
    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-gold bg-surface">
      {profile.avatarUrl ? (
        <Avatar name={profile.name} src={profile.avatarUrl} className="size-full" />
      ) : (
        <span className="font-display text-lg font-bold text-gold">
          {initials(profile.name)}
        </span>
      )}
    </div>
  );
}

/**
 * "Alterar foto" (l.2754). No protótipo era um toast "será habilitado em
 * breve"; aqui é upload de verdade, pelo MESMO `StorageAdapter` que o logo da
 * barbearia usa desde o agente 25.
 */
function AvatarActions({ profile }: { profile: MyProfile }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatarMutation();
  const remove = useRemoveAvatarMutation();
  const busy = upload.isPending || remove.isPending;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    // Mesmo contrato do `StorageAdapter` — recusar aqui poupa o upload inteiro.
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ message: 'Formato não suportado. Envie JPG, PNG ou WebP.', tone: 'danger' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ message: 'Imagem acima de 5 MB.', tone: 'danger' });
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast({ message: 'Foto atualizada.', tone: 'success' });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível enviar a foto.'), tone: 'danger' });
    }
  };

  const drop = async () => {
    try {
      await remove.mutateAsync();
      toast({ message: 'Foto removida.', tone: 'success' });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível remover a foto.'), tone: 'danger' });
    }
  };

  // 44px de alvo no dedo, a altura do texto a partir de `md` — as duas ações
  // são links de texto no desenho, e no celular um alvo de 16px reprova a
  // régua das WCAG (regra 6).
  const linkClasses =
    'flex h-11 w-fit items-center text-xs font-medium text-fg-muted transition-colors disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-auto';

  return (
    <div className="-my-3 flex flex-wrap items-center gap-3 md:my-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        // `hidden`, e não `sr-only`: continua abrindo o seletor por `.click()`
        // e não entra na varredura como um controle de 1×1.
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          // Zera para que reescolher o MESMO arquivo dispare `change` de novo.
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(linkClasses, 'hover:text-fg')}
      >
        {upload.isPending ? 'Enviando…' : 'Alterar foto'}
      </button>
      {profile.avatarUrl && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void drop()}
          className={cn(linkClasses, 'hover:text-danger')}
        >
          {remove.isPending ? 'Removendo…' : 'Remover'}
        </button>
      )}
    </div>
  );
}

// ── Segurança (l.2776–2795) ─────────────────────────────────────────────────

/**
 * Três campos e um erro embaixo do último, como o desenho — não o par lado a
 * lado que existia antes. A confirmação faltava, e sem ela um erro de digitação
 * na nova senha só aparecia no próximo login, já com as sessões derrubadas.
 */
function SecurityCard() {
  const { client } = useEstablishmentAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!isPasswordValid(next) || next !== confirm) {
      // A frase é a do protótipo (l.4841), com a régua REAL de
      // `isPasswordValid` — 8 caracteres com letra e número, a mesma que a API
      // aplica. Prometer menos do que o servidor exige daria um 400 sem
      // explicação no campo.
      setError('A nova senha deve ter ao menos 8 caracteres, com letra e número, e ser igual à confirmação.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await establishmentApi.changePassword(client, { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      // O backend derruba as DEMAIS sessões e mantém esta — avisar, senão o
      // usuário descobre sozinho ao trocar de dispositivo.
      toast({ message: 'Senha alterada. As outras sessões foram encerradas.', tone: 'success' });
    } catch (requestError) {
      const message = authErrorMessage(requestError, 'Não foi possível alterar a senha.');
      setError(message);
      toast({ message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && !saving;

  return (
    <Card className="gap-3.5 p-5">
      <h2 className="font-display text-[15px] font-semibold text-fg">Segurança</h2>

      <PasswordInput
        label="Senha atual"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <PasswordInput
        label="Nova senha"
        autoComplete="new-password"
        showStrength
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <PasswordInput
        label="Confirmar nova senha"
        autoComplete="new-password"
        error={error || undefined}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />

      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} loading={saving} onClick={() => void submit()}>
          Alterar senha
        </Button>
      </div>
    </Card>
  );
}

// ── Privacidade e dados (l.2797–2805 / funcionário l.836–842) ───────────────

function PrivacyCard({ profile }: { profile: MyProfile }) {
  const { toast } = useToast();
  const exportData = useExportMyDataMutation();
  const [askDeletion, setAskDeletion] = useState(false);

  const download = async () => {
    try {
      await exportData.mutateAsync();
      toast({ message: 'Seus dados foram baixados.', tone: 'success' });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível exportar.'), tone: 'danger' });
    }
  };

  return (
    <Card className="gap-3.5 p-5">
      <h2 className="font-display text-[15px] font-semibold text-fg">Privacidade e dados</h2>
      <p className="text-[13px] text-fg-muted">
        {profile.canDeleteAccount
          ? 'Em conformidade com a LGPD, você pode exportar ou excluir seus dados a qualquer momento.'
          : 'Em conformidade com a LGPD, você pode exportar ou solicitar a exclusão dos seus dados a qualquer momento.'}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" loading={exportData.isPending} onClick={() => void download()}>
          Baixar meus dados
        </Button>

        {/* Só quem NÃO é dono pede a exclusão ao administrador: o dono tem o
            bloco vermelho logo abaixo, que exclui de fato. */}
        {!profile.canDeleteAccount && (
          <Button
            variant="outline"
            size="sm"
            className={DANGER_OUTLINE}
            onClick={() => setAskDeletion(true)}
          >
            Solicitar exclusão dos meus dados
          </Button>
        )}

        {/* O link é do desenho do PAINEL (l.2804), que serve dono E gerente; o
            do funcionário não o tem. A régua é o papel, não o poder de
            excluir a conta — senão o gerente ficava sem ele. */}
        {profile.role !== MembershipRole.BARBER && (
          <a
            href="/privacidade"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center px-1 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg md:h-auto"
          >
            Política de Privacidade
          </a>
        )}
      </div>

      <DataDeletionModal open={askDeletion} onClose={() => setAskDeletion(false)} />
    </Card>
  );
}

// ── ATENÇÃO (l.2807–2814) ───────────────────────────────────────────────────

/**
 * O bloco vermelho, só para o dono.
 *
 * Ele tem DOIS estados. O do desenho (nada agendado) e o que o próprio modal
 * promete: exclusão marcada, com a data e a saída para desistir. Sem esse
 * segundo estado, os "30 dias para reativar" seriam uma frase sem botão.
 */
function DangerZoneCard({ profile }: { profile: MyProfile }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cancel = useCancelAccountDeletionMutation();
  const [open, setOpen] = useState(false);
  const scheduled = profile.scheduledDeletion;

  const undo = async () => {
    try {
      await cancel.mutateAsync();
      toast({ message: 'Exclusão cancelada. Sua barbearia continua ativa.', tone: 'success' });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível cancelar.'), tone: 'danger' });
    }
  };

  return (
    <Card className="gap-3.5 border-danger/40 p-5">
      <h2 className="font-display text-[15px] font-semibold text-danger">ATENÇÃO</h2>

      {scheduled ? (
        <>
          <p className="text-[13px] text-fg-muted">
            Exclusão agendada para{' '}
            <strong className="font-semibold text-fg">
              {new Date(scheduled.purgeAt).toLocaleDateString('pt-BR')}
            </strong>
            {' — '}
            {scheduled.daysLeft === 0
              ? 'é o último dia para desistir'
              : `faltam ${scheduled.daysLeft} ${scheduled.daysLeft === 1 ? 'dia' : 'dias'} para desistir`}
            . Sua assinatura já foi cancelada; até lá a barbearia continua funcionando normalmente.
          </p>
          <div>
            <Button variant="outline" size="sm" loading={cancel.isPending} onClick={() => void undo()}>
              Cancelar exclusão
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-fg-muted">
            Excluir a conta remove permanentemente a barbearia, unidades, equipe, agendamentos e
            histórico de clientes. A assinatura ativa é cancelada.
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              className={DANGER_OUTLINE}
              onClick={() => setOpen(true)}
            >
              Excluir minha conta
            </Button>
          </div>
        </>
      )}

      <DeleteAccountModal
        open={open}
        onClose={() => setOpen(false)}
        onScheduled={(next) => queryClient.setQueryData<MyProfile>(MY_PROFILE_KEY, next)}
      />
    </Card>
  );
}

/** Primeira letra do primeiro e do último nome, como o `mpAvatarInitials`. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
