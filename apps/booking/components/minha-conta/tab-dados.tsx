'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { EMAIL_RE, formatPhone, isPasswordValid, type OtpChallenge } from '@barbervp/types';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  OtpInput,
  PasswordInput,
  Switch,
  authErrorMessage,
  clientApi,
  maskPhoneInput,
  useClientAuth,
  useToast,
} from '@barbervp/ui';

export function TabDados({ onClose }: { onClose: () => void }) {
  const { client, api, logout, refresh } = useClientAuth();
  const { toast } = useToast();

  // ── Dados pessoais ─────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(client?.name ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setName(client?.name ?? '');
    setEmail(client?.email ?? '');
  }, [client?.name, client?.email]);

  const nameValid = name.trim().length >= 2;
  const emailValid = EMAIL_RE.test(email);

  const saveProfile = useMutation({
    mutationFn: () => clientApi.updateProfile(api, { name: name.trim(), email: email.trim() }),
    onSuccess: async () => {
      await refresh();
      setEditMode(false);
      toast({ message: 'Dados atualizados', tone: 'success' });
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível salvar.'), tone: 'danger' }),
  });

  // ── Troca de telefone ────────────────────────────────────────────────────
  const [phoneOpen, setPhoneOpen] = useState(false);

  // ── Segurança: senha ─────────────────────────────────────────────────────
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const newPasswordValid = isPasswordValid(newPassword);
  const confirmValid = newPasswordValid && confirmNewPassword === newPassword;

  const changePassword = useMutation({
    mutationFn: () => clientApi.changePassword(api, { currentPassword, newPassword, confirmNewPassword }),
    onSuccess: () => {
      toast({ message: 'Senha atualizada com sucesso', tone: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordTouched(false);
      setSecurityExpanded(false);
    },
    onError: (error) =>
      toast({ message: authErrorMessage(error, 'Não foi possível trocar a senha.'), tone: 'danger' }),
  });

  // ── Notificações ─────────────────────────────────────────────────────────
  const toggleNotify = useMutation({
    mutationFn: (patch: { notifyWhatsapp?: boolean; notifyEmail?: boolean }) =>
      clientApi.updateProfile(api, patch),
    onSuccess: () => void refresh(),
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível salvar.'), tone: 'danger' }),
  });

  // ── LGPD ─────────────────────────────────────────────────────────────────
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  const exportData = useMutation({
    mutationFn: () => clientApi.exportData(api),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'meus-dados-barbervp.json';
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível exportar.'), tone: 'danger' }),
  });

  const deleteAccount = useMutation({
    mutationFn: () => clientApi.deleteAccount(api),
    onSuccess: async () => {
      toast({ message: 'Conta excluída' });
      setShowDeleteSheet(false);
      onClose();
      await logout();
    },
    onError: (error) => toast({ message: authErrorMessage(error, 'Não foi possível excluir.'), tone: 'danger' }),
  });

  if (!client) return null;

  return (
    <div className="flex flex-col gap-7">
      {/* Dados pessoais */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-bold text-fg">Dados pessoais</h3>
          {!editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              Editar
            </Button>
          )}
        </div>

        <Input
          label="Nome"
          value={name}
          disabled={!editMode}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          error={editMode && touched && !nameValid ? 'Mínimo 2 caracteres' : undefined}
          success={editMode && touched && nameValid}
        />

        <Input
          label="E-mail"
          type="email"
          value={email}
          disabled={!editMode}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched(true)}
          error={editMode && touched && !emailValid ? 'E-mail inválido' : undefined}
          success={editMode && touched && emailValid}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-fg-muted">Celular</span>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-fg">{formatPhone(client.phone)}</span>
            <button type="button" onClick={() => setPhoneOpen(true)} className="text-[13px] text-gold hover:underline">
              Alterar
            </button>
          </div>
        </div>

        {editMode && (
          <div className="mt-1 flex gap-2.5">
            <Button
              fullWidth
              size="sm"
              disabled={!(nameValid && emailValid)}
              loading={saveProfile.isPending}
              onClick={() => {
                setTouched(true);
                if (nameValid && emailValid) saveProfile.mutate();
              }}
            >
              Salvar alterações
            </Button>
            <Button
              variant="ghost"
              fullWidth
              size="sm"
              onClick={() => {
                setEditMode(false);
                setTouched(false);
                setName(client.name);
                setEmail(client.email ?? '');
              }}
            >
              Cancelar
            </Button>
          </div>
        )}
      </section>

      <div className="h-px bg-border" />

      {/* Segurança */}
      <section className="flex flex-col gap-3.5">
        <h3 className="font-display text-[15px] font-bold text-fg">Segurança</h3>
        <button
          type="button"
          onClick={() => setSecurityExpanded((current) => !current)}
          className="flex items-center justify-between"
        >
          <span className="text-sm text-fg">Alterar senha</span>
          <span className="text-sm text-fg-muted">{securityExpanded ? '▴' : '▾'}</span>
        </button>

        {securityExpanded && (
          <div className="flex flex-col gap-3.5">
            <PasswordInput
              label="Senha atual"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Sua senha atual"
            />
            <PasswordInput
              label="Nova senha"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onBlur={() => setPasswordTouched(true)}
              placeholder="mínimo 8 caracteres"
              error={passwordTouched && !newPasswordValid ? 'Mínimo 8 caracteres, com letra e número' : undefined}
              showStrength
            />
            <PasswordInput
              label="Confirmar nova senha"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              onBlur={() => setPasswordTouched(true)}
              placeholder="repita a senha"
              error={passwordTouched && newPassword.length > 0 && !confirmValid ? 'As senhas não coincidem' : undefined}
            />
            <Button
              disabled={!(currentPassword.length > 0 && newPasswordValid && confirmValid)}
              loading={changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              Atualizar senha
            </Button>
          </div>
        )}
      </section>

      <div className="h-px bg-border" />

      {/* Notificações */}
      <section className="flex flex-col gap-3.5">
        <h3 className="font-display text-[15px] font-bold text-fg">Notificações</h3>
        <Switch
          label="Lembrete por WhatsApp"
          checked={client.notifyWhatsapp}
          onChange={(event) => toggleNotify.mutate({ notifyWhatsapp: event.target.checked })}
        />
        <Switch
          label="Lembrete por e-mail"
          checked={client.notifyEmail}
          onChange={(event) => toggleNotify.mutate({ notifyEmail: event.target.checked })}
        />
        <p className="text-xs text-fg-muted">Enviamos lembretes antes do seu horário.</p>
      </section>

      <div className="h-px bg-border" />

      {/* Sessão e LGPD */}
      <section className="flex flex-col items-start gap-3.5">
        <button type="button" onClick={() => void logout()} className="text-[15px] font-semibold text-danger">
          Sair
        </button>
        <button
          type="button"
          onClick={() => exportData.mutate()}
          disabled={exportData.isPending}
          className="text-[13px] text-fg-muted underline decoration-dotted hover:text-fg disabled:opacity-50"
        >
          {exportData.isPending ? 'Preparando arquivo…' : 'Exportar meus dados'}
        </button>
        <span
          onClick={() => setShowDeleteSheet(true)}
          className="cursor-pointer text-[13px] text-fg-muted underline decoration-dotted"
        >
          Excluir minha conta
        </span>
      </section>

      <PhoneChangeDialog open={phoneOpen} onClose={() => setPhoneOpen(false)} />

      <Modal
        open={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        title="Excluir sua conta?"
        dismissOnOverlayClick={!deleteAccount.isPending}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-fg-muted">
            Essa ação é irreversível. Você perderá o acesso ao seu histórico de agendamentos e dados
            salvos.
          </p>
          <Checkbox
            label="Entendo que essa ação é irreversível"
            checked={deleteConfirmChecked}
            onChange={(event) => setDeleteConfirmChecked(event.target.checked)}
          />
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              disabled={!deleteConfirmChecked}
              loading={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              Excluir minha conta
            </Button>
            <Button variant="ghost" onClick={() => setShowDeleteSheet(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Fluxo de troca de telefone — pede o número novo, confirma com o OTP. */
function PhoneChangeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, refresh } = useClientAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('phone');
      setPhone('');
      setChallenge(null);
      setCode('');
      setError(null);
    }
  }, [open]);

  const requestMutation = useMutation({
    mutationFn: () => clientApi.requestPhoneChange(api, phone),
    onSuccess: (next) => {
      setChallenge(next);
      setStep('otp');
    },
    onError: (caught) => toast({ message: authErrorMessage(caught, 'Não foi possível continuar.'), tone: 'danger' }),
  });

  const confirmMutation = useMutation({
    mutationFn: (value: string) =>
      clientApi.confirmPhoneChange(api, { challengeId: challenge!.challengeId, code: value }),
    onSuccess: async () => {
      await refresh();
      toast({ message: 'Telefone atualizado', tone: 'success' });
      onClose();
    },
    onError: (caught) => {
      setError(authErrorMessage(caught, 'Código inválido. Tente novamente.'));
      setCode('');
    },
  });

  const digits = phone.replace(/\D/g, '');

  return (
    <Modal open={open} onClose={onClose} title={step === 'phone' ? 'Novo telefone' : 'Verificar'}>
      {step === 'phone' ? (
        <div className="flex flex-col gap-4">
          <Input
            label="Novo celular"
            value={phone}
            onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
            inputMode="numeric"
            placeholder="(16) 9 9999-0001"
          />
          <Button
            disabled={digits.length < 10}
            loading={requestMutation.isPending}
            onClick={() => requestMutation.mutate()}
          >
            Continuar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-sm text-fg-muted">
            Enviamos um código de 6 dígitos para {challenge?.destinationMasked}
          </p>
          <OtpInput
            value={code}
            onChange={(next) => {
              setCode(next);
              setError(null);
            }}
            onComplete={(next) => confirmMutation.mutate(next)}
            error={error}
            autoFocus
          />
          <Button
            fullWidth
            disabled={code.length !== 6}
            loading={confirmMutation.isPending}
            onClick={() => confirmMutation.mutate(code)}
          >
            Confirmar
          </Button>
        </div>
      )}
    </Modal>
  );
}
