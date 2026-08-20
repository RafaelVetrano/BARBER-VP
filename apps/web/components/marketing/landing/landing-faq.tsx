'use client';

import { useState } from 'react';
import type { LandingFaq as LandingFaqItem } from './content';

/**
 * Accordion do FAQ — um aberto por vez, o primeiro aberto por padrão.
 *
 * `<button aria-expanded/aria-controls>` e não `<details>` para manter o "+"
 * girando 45° e o comportamento de fechar o irmão, ambos do protótipo. O painel
 * fica no DOM sempre (escondido por `hidden`) para o robô de busca ler as seis
 * respostas — elas são o corpo do `FAQPage` do JSON-LD, e responder ao robô uma
 * coisa e ao usuário outra é exatamente o que o Google penaliza.
 *
 * As perguntas chegam por prop e não são importadas aqui: duas delas citam
 * preço e limite de barbeiros, que vêm da API no servidor. Buscá-las no cliente
 * deixaria o robô de busca sem as respostas.
 */
export function LandingFaq({ faqs }: { faqs: LandingFaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="flex flex-col gap-2.5">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div
            key={faq.q}
            className="overflow-hidden rounded-[13px] border border-[var(--bvp-line)] bg-[var(--bvp-surface)]"
          >
            <button
              type="button"
              id={`bvp-faq-trigger-${index}`}
              aria-expanded={open}
              aria-controls={`bvp-faq-panel-${index}`}
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-[var(--bvp-txt)]"
            >
              <span>{faq.q}</span>
              <span
                aria-hidden
                className="flex-shrink-0 text-[20px] font-normal leading-none text-[var(--bvp-gold)] transition-transform duration-150"
                style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
              >
                +
              </span>
            </button>
            <div
              id={`bvp-faq-panel-${index}`}
              role="region"
              aria-labelledby={`bvp-faq-trigger-${index}`}
              hidden={!open}
              className="px-5 pb-[18px] text-[14px] leading-[1.6] text-[var(--bvp-txt-2)]"
            >
              {faq.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
