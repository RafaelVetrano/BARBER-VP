import type { ReactNode } from 'react';

/**
 * Tipografia das páginas legais. Um lugar só para o ritmo do texto, para que
 * `/privacidade` e `/termos` não divirjam com o tempo.
 */
export function LegalTitle({ children, updatedAt }: { children: ReactNode; updatedAt: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-6">
      <h1 className="font-display text-2xl font-bold text-fg md:text-3xl">{children}</h1>
      <p className="text-[13px] text-fg-muted">Última atualização: {updatedAt}</p>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-fg">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc text-sm leading-relaxed text-fg-muted">
          {item}
        </li>
      ))}
    </ul>
  );
}
