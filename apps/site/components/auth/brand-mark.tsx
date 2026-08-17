import Link from 'next/link';
import { cn } from '@barbervp/ui';

export interface BrandMarkProps {
  className?: string;
  /** `sm` no cabeçalho mobile, `md` no painel de arte do desktop. */
  size?: 'sm' | 'md';
}

/** Logotipo "B BarberVP" das telas de auth — quadrado dourado + wordmark. */
export function BrandMark({ className, size = 'md' }: BrandMarkProps) {
  return (
    <Link
      href="/"
      className={cn(
        'inline-flex items-center gap-2.5 rounded-control',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center rounded-lg bg-gradient-to-br from-gold-hover to-gold font-display font-bold text-bg',
          size === 'sm' ? 'size-7 text-sm' : 'size-8 text-base',
        )}
      >
        B
      </span>
      <span
        className={cn(
          'font-display font-bold tracking-tight text-fg',
          size === 'sm' ? 'text-base' : 'text-lg',
        )}
      >
        Barber<span className="text-gold">VP</span>
      </span>
    </Link>
  );
}
