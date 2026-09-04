import type { ReactNode } from 'react';

export interface PhoneFrameProps {
  children: ReactNode;
  /** Nome da barbearia — vai na barra de status, como o `title` do protótipo. */
  title: string;
}

/**
 * Moldura de celular do "Preview ao vivo" (`Dashboard.dc.html` l.2352, o
 * `x-import IOSDevice` de 320×660).
 *
 * O conteúdo rola POR DENTRO da moldura (`overflow-y-auto`): a página pública
 * é mais alta que 660px e um preview que cresce empurraria a coluna do editor.
 */
export function PhoneFrame({ children, title }: PhoneFrameProps) {
  return (
    <div
      className="w-full max-w-[320px] overflow-hidden rounded-[38px] border-[6px] border-surface-3 bg-bg shadow-modal"
      // O preview é ilustração do resultado, não a página: nada aqui deve ser
      // alcançável por Tab a partir do editor.
      aria-hidden="true"
    >
      <div className="relative flex h-[660px] flex-col bg-bg">
        {/* Barra de status + "notch" */}
        <div className="relative flex h-9 shrink-0 items-center justify-center border-b border-border bg-surface px-4">
          <span className="absolute left-1/2 top-0 h-4 w-24 -translate-x-1/2 rounded-b-2xl bg-surface-3" />
          <span className="w-full truncate text-center text-[11px] font-medium text-fg-muted">
            {title}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
