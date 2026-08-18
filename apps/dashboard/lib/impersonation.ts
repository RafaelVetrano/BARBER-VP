'use client';

const KEY = 'bvp_impersonation';

export interface ImpersonationInfo {
  ownerName: string;
  tenantSlug: string;
}

/**
 * Marca/lê/limpa o estado "estou vendo o painel como impersonação" — vive só
 * em `sessionStorage` (por aba, some ao fechar), NUNCA no JWT: a sessão
 * impersonada tem `sub`/papéis REAIS do dono (fase 08 → decisão técnica), e
 * misturar essa informação de UI no token misturaria dois conceitos
 * diferentes. A auditoria "de verdade" já aconteceu no servidor, no momento
 * em que o super admin gerou o token — isto aqui é só o banner.
 */
export function markImpersonating(info: ImpersonationInfo): void {
  sessionStorage.setItem(KEY, JSON.stringify(info));
}

export function impersonationInfo(): ImpersonationInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationInfo;
  } catch {
    return null;
  }
}

export function clearImpersonation(): void {
  sessionStorage.removeItem(KEY);
}
