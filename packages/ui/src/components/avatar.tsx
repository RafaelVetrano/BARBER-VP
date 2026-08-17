import { cn } from '../lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Nome completo — as iniciais saem daqui e viram o `alt` da foto. */
  name: string;
  /** URL da foto. Sem ela, entram as iniciais sobre o gradiente dourado. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const SIZE: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-[30px] text-[11px]',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
};

/** Primeira letra do primeiro e do último nome (máx. 2), como no protótipo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Avatar de barbeiro/cliente. Sem foto, mostra as iniciais sobre um gradiente
 * dourado com texto escuro — 8.5:1 de contraste, bem acima de AA.
 *
 * A foto é `<img>` puro (e não `next/image`): `packages/ui` é compartilhado
 * pelas 4 apps e não deve depender do runtime do Next.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const base = cn('shrink-0 overflow-hidden rounded-full', SIZE[size], className);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn(base, 'object-cover')} />;
  }

  return (
    <span
      className={cn(
        base,
        'grid place-items-center bg-gradient-to-br from-gold to-gold-hover font-semibold text-bg',
      )}
      // A informação já está no texto ao lado; o avatar é ornamento.
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
