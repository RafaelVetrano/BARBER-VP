import {
  closeBlockedReason,
  type CloseAttempt,
} from '@/components/dashboard/pos/pos-shared';

/**
 * A REGRA 4 DO PROJETO, no ponto em que ela mais custou: o fechamento da
 * comanda.
 *
 * "Todo botão que não pode agir explica por quê, em texto, no lugar dele."
 * Antes do agente 31 o botão "Fechar comanda" ficava `disabled` numa comanda
 * de R$ 0 — sem explicação e sem saída, com o cliente na frente do balcão.
 * Estes casos travam o contrário: para cada situação em que não dá para
 * fechar, existe uma frase; e nas que dá, `null`.
 *
 * O outro lado da mesma regra é do servidor (`OrdersService.close`), coberto
 * em `concluir-comanda-zero.e2e-spec.ts`. Aqui é a tela.
 */
describe('closeBlockedReason — por que a comanda não fecha agora', () => {
  const base: CloseAttempt = {
    itemCount: 1,
    totalCents: 4_500,
    courtesyChosen: false,
    courtesyReason: '',
    splitting: false,
    remainingCents: 0,
  };

  it('deixa fechar a comanda comum, com valor e método único', () => {
    expect(closeBlockedReason(base)).toBeNull();
  });

  it('comanda vazia manda acrescentar item ou cancelar — as DUAS saídas', () => {
    expect(closeBlockedReason({ ...base, itemCount: 0 })).toBe(
      'Adicione um item ou cancele a comanda.',
    );
  });

  it('a comanda vazia é avisada ANTES do R$ 0: é o caso mais comum e tem saída própria', () => {
    // Sem itens o total também é zero; pedir "motivo da cortesia" aqui mandaria
    // o balcão justificar uma comanda que ele só precisa descartar.
    expect(closeBlockedReason({ ...base, itemCount: 0, totalCents: 0 })).toBe(
      'Adicione um item ou cancele a comanda.',
    );
  });

  it('sem valor a cobrar, exige o motivo — e libera quando ele vem', () => {
    const zero = { ...base, totalCents: 0 };
    expect(closeBlockedReason(zero)).toBe('Informe o motivo da cortesia.');
    expect(closeBlockedReason({ ...zero, courtesyReason: '   ' })).toBe(
      'Informe o motivo da cortesia.',
    );
    // Curto demais: o servidor exige 5 caracteres, e a tela diz isso antes.
    expect(closeBlockedReason({ ...zero, courtesyReason: 'oi' })).toBe(
      'Informe o motivo da cortesia.',
    );
    expect(
      closeBlockedReason({ ...zero, courtesyReason: 'Refazendo o corte da semana passada' }),
    ).toBeNull();
  });

  it('cortesia escolhida numa comanda COM valor também precisa de motivo', () => {
    const cortesia = { ...base, courtesyChosen: true };
    expect(closeBlockedReason(cortesia)).toBe('Informe o motivo da cortesia.');
    expect(closeBlockedReason({ ...cortesia, courtesyReason: 'Brinde' })).toBeNull();
  });

  it('motivo acima do teto do servidor é recusado na tela, não no 400', () => {
    expect(
      closeBlockedReason({ ...base, totalCents: 0, courtesyReason: 'x'.repeat(201) }),
    ).toBe('Informe o motivo da cortesia.');
  });

  it('split que não bate com o total diz quanto falta fechar', () => {
    expect(closeBlockedReason({ ...base, splitting: true, remainingCents: 500 })).toBe(
      'A soma dos pagamentos não bate com o total.',
    );
    expect(closeBlockedReason({ ...base, splitting: true, remainingCents: -500 })).toBe(
      'A soma dos pagamentos não bate com o total.',
    );
    expect(closeBlockedReason({ ...base, splitting: true, remainingCents: 0 })).toBeNull();
  });

  it('a sobra do split só importa quando o split está ligado', () => {
    // Método único aloca o total inteiro por definição — uma sobra residual no
    // estado não pode travar o fechamento.
    expect(closeBlockedReason({ ...base, splitting: false, remainingCents: 500 })).toBeNull();
  });
});
