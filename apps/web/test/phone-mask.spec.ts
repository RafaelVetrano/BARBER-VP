import { maskPhoneInput } from '@barbervp/ui';
import { normalizeMobilePhone } from '@barbervp/types';

/**
 * A máscara do celular e a normalização compartilhada precisam concordar sobre
 * o CÓDIGO DO PAÍS.
 *
 * O defeito que estes casos travam foi encontrado pelo agente 32 conferindo no
 * navegador: `maskPhoneInput` pegava os 11 PRIMEIROS dígitos do que se digita,
 * então colar `+55 16 99999-0001` — o formato que o WhatsApp e o catálogo do
 * celular entregam — deixava `(55) 1 6999-9900` no campo. Um número diferente,
 * igualmente válido, gravado sem um aviso sequer. Com o celular agora `@unique`
 * em `User`, isso é pior do que um contato errado: é o dono achando que
 * cadastrou o número dele.
 *
 * A regra é a MESMA de `normalizePhone` em `@barbervp/types` — descarta `55` só
 * quando há mais de 11 dígitos —, e é por isso que a asserção final compara as
 * duas funções em vez de repetir a expectativa à mão.
 */
describe('maskPhoneInput — código do país', () => {
  it('descarta o 55 dos formatos que trazem o país', () => {
    expect(maskPhoneInput('+55 16 99999-0001')).toBe('(16) 9 9999-0001');
    expect(maskPhoneInput('5516999990001')).toBe('(16) 9 9999-0001');
    expect(maskPhoneInput('+5516999990001')).toBe('(16) 9 9999-0001');
  });

  it('não mexe no que já vem local', () => {
    expect(maskPhoneInput('16999990001')).toBe('(16) 9 9999-0001');
    expect(maskPhoneInput('(16) 9 9999-0001')).toBe('(16) 9 9999-0001');
    expect(maskPhoneInput('1633334444')).toBe('(16) 3333-4444');
  });

  it('preserva o DDD 55 — Rio Grande do Sul existe', () => {
    // Só descarta o `55` quando há MAIS de 11 dígitos; até lá ele é DDD.
    expect(maskPhoneInput('55999990001')).toBe('(55) 9 9999-0001');
    expect(maskPhoneInput('5599')).toBe('(55) 99');
  });

  it('formata progressivamente enquanto se digita', () => {
    expect(maskPhoneInput('')).toBe('');
    expect(maskPhoneInput('1')).toBe('(1');
    expect(maskPhoneInput('16')).toBe('(16');
    expect(maskPhoneInput('169')).toBe('(16) 9');
  });

  it('o que a máscara mostra normaliza no MESMO número que o servidor grava', () => {
    const formatos = ['16999990001', '+55 16 99999-0001', '5516999990001', '(16) 9 9999-0001'];
    const normalizados = formatos.map((entrada) => normalizeMobilePhone(maskPhoneInput(entrada)));

    expect(new Set(normalizados).size).toBe(1);
    expect(normalizados[0]).toBe('5516999990001');
  });
});
