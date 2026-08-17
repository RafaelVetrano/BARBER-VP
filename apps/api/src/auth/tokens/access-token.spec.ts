import { parseTtlSeconds } from './access-token.service';

describe('parseTtlSeconds', () => {
  it('entende a notação do env (`15m`, `30d`, `12h`) e segundos crus', () => {
    expect(parseTtlSeconds('15m')).toBe(900);
    expect(parseTtlSeconds('30d')).toBe(2_592_000);
    expect(parseTtlSeconds('12h')).toBe(43_200);
    expect(parseTtlSeconds('45s')).toBe(45);
    expect(parseTtlSeconds('900')).toBe(900);
  });

  it('tolera espaços em volta', () => {
    expect(parseTtlSeconds('  15m ')).toBe(900);
  });

  it('falha alto em valor inválido — melhor no boot que em produção', () => {
    expect(() => parseTtlSeconds('quinze minutos')).toThrow(/TTL de JWT inválido/);
    expect(() => parseTtlSeconds('15y')).toThrow(/TTL de JWT inválido/);
    expect(() => parseTtlSeconds('')).toThrow(/TTL de JWT inválido/);
  });
});
