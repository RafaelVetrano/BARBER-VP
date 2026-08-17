import { maskDocument, maskEmail, maskPhone } from './mask';

describe('máscaras de dado pessoal', () => {
  it('mantém DDI/DDD e os 4 últimos dígitos do telefone', () => {
    expect(maskPhone('5511987654321')).toBe('5511*****4321');
  });

  it('aceita telefone formatado', () => {
    expect(maskPhone('+55 (11) 98765-4321')).toBe('5511*****4321');
  });

  it('não vaza número curto demais para mascarar', () => {
    expect(maskPhone('1234')).toBe('****');
  });

  it('preserva só as duas primeiras letras do e-mail', () => {
    expect(maskEmail('rafael@exemplo.com')).toBe('ra****@exemplo.com');
  });

  it('devolve marcador quando o e-mail é inválido', () => {
    expect(maskEmail('sem-arroba')).toBe('***');
  });

  it('esconde início e fim do documento', () => {
    expect(maskDocument('123.456.789-00')).toBe('***456789**');
  });
});
