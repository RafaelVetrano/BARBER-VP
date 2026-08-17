import { hashSecret, randomOtpCode, randomSecret, secretMatches } from './secret-hash';

const PEPPER = 'pepper-de-teste-com-tamanho-suficiente';

describe('secret-hash', () => {
  it('produz o mesmo hash para o mesmo segredo e pepper', () => {
    expect(hashSecret('abc', PEPPER)).toBe(hashSecret('abc', PEPPER));
  });

  it('muda o hash quando o pepper muda — um dump do banco não basta', () => {
    expect(hashSecret('abc', PEPPER)).not.toBe(hashSecret('abc', 'outro-pepper'));
  });

  it('devolve hex de 64 caracteres (SHA-256)', () => {
    expect(hashSecret('abc', PEPPER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('confere o segredo certo e recusa o errado', () => {
    const stored = hashSecret('segredo', PEPPER);
    expect(secretMatches('segredo', stored, PEPPER)).toBe(true);
    expect(secretMatches('segred0', stored, PEPPER)).toBe(false);
  });

  it('não estoura com hash guardado de tamanho inesperado', () => {
    expect(secretMatches('segredo', 'curto', PEPPER)).toBe(false);
    expect(secretMatches('segredo', '', PEPPER)).toBe(false);
  });

  it('gera segredos url-safe e distintos', () => {
    const first = randomSecret();
    const second = randomSecret();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('gera OTP de exatamente 6 dígitos, inclusive com zeros à esquerda', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(randomOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});
