'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircleIcon, CheckCircleIcon, CloseIcon, InfoCircleIcon } from '../icons';
import { cn } from '../lib/cn';
import { useIsMounted } from '../lib/use-overlay';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning';

export interface ToastOptions {
  message: ReactNode;
  tone?: ToastTone;
  /** Milissegundos até sumir sozinho. Padrão 3000 (o do protótipo). */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'message'>> {
  id: number;
  message: ReactNode;
}

interface ToastContextValue {
  /** Enfileira um toast e devolve o id (para descartar antes da hora). */
  toast: (options: ToastOptions | string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Acesso ao toast em qualquer componente abaixo do `ToastProvider`.
 *
 * ```tsx
 * const { toast } = useToast();
 * toast('Link copiado!');
 * toast({ message: 'Não foi possível cancelar', tone: 'danger' });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}

const TONE_ICON = {
  neutral: InfoCircleIcon,
  success: CheckCircleIcon,
  danger: AlertCircleIcon,
  warning: AlertCircleIcon,
} as const;

/**
 * Toast único do BarberVP — consolida as 5 variações do protótipo
 * (`toastIn`/`wizToastIn`/`authToastIn`/`contaToastIn`/`assinToastIn`, todas
 * fade + `translateY(8px)`→0) num só componente e numa só keyframe
 * (`bvpToastIn` no preset).
 *
 * Fica acima dos overlays (z-[200] contra o z-50 do `Modal`) porque no
 * protótipo o toast aparece por cima da sheet do wizard.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const isMounted = useIsMounted();
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions | string) => {
      const normalized = typeof options === 'string' ? { message: options } : options;
      const id = nextId.current++;
      const item: ToastItem = {
        id,
        message: normalized.message,
        tone: normalized.tone ?? 'neutral',
        duration: normalized.duration ?? 3000,
      };
      setItems((current) => [...current, item]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), item.duration),
      );
      return id;
    },
    [dismiss],
  );

  // Limpa os timers pendentes se a app desmontar no meio.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {isMounted &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex flex-col items-center gap-2 px-4">
            {items.map((item) => (
              <Toast key={item.id} {...item} onDismiss={() => dismiss(item.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export interface ToastProps {
  message: ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

/** A pílula em si — exportada para inspeção no playground e testes visuais. */
export function Toast({ message, tone = 'neutral', onDismiss, className }: ToastProps) {
  const Icon = TONE_ICON[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border py-2.5 pl-4 pr-2.5',
        'animate-bvp-toast-in border-border bg-surface-3 text-sm text-fg shadow-toast',
        className,
      )}
    >
      <Icon
        size={16}
        className={cn(
          'shrink-0',
          tone === 'neutral' && 'text-fg-muted',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
        )}
      />
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar aviso"
          className="grid size-6 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-border hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  );
}
