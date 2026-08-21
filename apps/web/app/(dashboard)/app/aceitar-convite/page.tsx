'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ApiError,
  Badge,
  Button,
  Card,
  PasswordInput,
  ScissorsIcon,
  Skeleton,
  getApiClient,
  isPasswordValid,
  useEstablishmentAuth,
} from '@barbervp/ui';
import { WEEKDAY_LABELS } from '@barbervp/types';
import type { EstablishmentSession, StaffInvitePreview } from '@barbervp/types';

const INVALID_REASON_LABEL: Record<NonNullable<StaffInvitePreview['invalidReason']>, string> = {
  EXPIRED: 'Este convite expirou. Peça para reenviarem.',
  REVOKED: 'Este convite foi cancelado pela barbearia.',
  ACCEPTED: 'Este convite já foi aceito — entre normalmente pelo login.',
};

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { adopt } = useEstablishmentAuth();

  const [preview, setPreview] = useState<StaffInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('Link de convite inválido.');
      setLoading(false);
      return;
    }
    const client = getApiClient();
    client
      .get<StaffInvitePreview>(`/staff-invites/${encodeURIComponent(token)}`)
      .then((response) => setPreview(response.data))
      .catch((error: unknown) =>
        setLoadError(error instanceof ApiError ? error.message : 'Não foi possível abrir o convite.'),
      )
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!isPasswordValid(password) || password !== confirmPassword) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const client = getApiClient();
      const { data } = await client.post<EstablishmentSession>('/staff-invites/accept', { token, password });
      adopt(data);
      router.replace('/app');
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-gold text-bg">
          <ScissorsIcon size={18} strokeWidth={2} />
        </span>
        <span className="font-display text-base font-bold text-fg">Barber VP</span>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!loading && (loadError || !preview) && (
        <Card>
          <p className="text-sm text-danger">{loadError ?? 'Convite não encontrado.'}</p>
        </Card>
      )}

      {!loading && preview && !preview.valid && (
        <Card className="gap-3">
          <p className="text-sm text-fg">
            {INVALID_REASON_LABEL[preview.invalidReason ?? 'EXPIRED']}
          </p>
          <Button variant="outline" onClick={() => router.push('/app')}>
            Ir para o login
          </Button>
        </Card>
      )}

      {!loading && preview && preview.valid && (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-display text-2xl font-bold text-fg">Bem-vindo(a), {preview.name.split(' ')[0]}!</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {preview.tenantName} te convidou para atender pela plataforma. Crie sua senha para começar.
            </p>
          </div>

          <Card className="gap-3">
            <div>
              <p className="text-xs text-fg-muted">E-mail (não pode ser alterado)</p>
              <p className="text-sm font-semibold text-fg">{preview.email}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-fg-muted">Serviços que vai atender</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.serviceNames.map((name) => (
                  <Badge key={name}>{name}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-fg-muted">Dias de trabalho</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.workDays.map((day) => (
                  <Badge key={day} tone="gold">
                    {WEEKDAY_LABELS[day]}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          <PasswordInput
            label="Crie sua senha"
            showStrength
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordInput
            label="Confirme a senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={confirmPassword && password !== confirmPassword ? 'As senhas não coincidem.' : undefined}
          />

          {submitError && (
            <p role="alert" className="text-[13px] text-danger">
              {submitError}
            </p>
          )}

          <Button
            fullWidth
            loading={submitting}
            disabled={!isPasswordValid(password) || password !== confirmPassword}
            onClick={() => void submit()}
          >
            Criar conta e entrar
          </Button>
        </div>
      )}
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}
