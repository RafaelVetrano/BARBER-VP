import {
  formatPhone,
  isPasswordValid,
  isValidSlug,
  maskEmailForDisplay,
  maskPhoneForDisplay,
  normalizeMobilePhone,
  normalizePhone,
  passwordStrength,
  slugify,
} from '@barbervp/types';

/**
 * As regras compartilhadas entre a API e as 4 apps web (`@barbervp/types` →
 * `auth.ts`). Cobri-las aqui protege os dois lados de uma vez: se o formulário
 * e o servidor discordassem, o campo ficaria verde e o POST voltaria 400.
 *
 * Os casos abaixo saem do protótipo (`ClienteAuth.dc.html`,
 * `BarberVP Configurar Barbearia.dc.html`).
 */
describe('regras compartilhadas de auth', () => {
  describe('senha', () => {
    it('aceita a partir de 8 caracteres com letra e número', () => {
      expect(isPasswordValid('senha123')).toBe(true);
      expect(isPasswordValid('minhasenha123')).toBe(true);
    });

    it('recusa curta demais, só letras ou só números', () => {
      expect(isPasswordValid('senha12')).toBe(false);
      expect(isPasswordValid('senhasenha')).toBe(false);
      expect(isPasswordValid('12345678')).toBe(false);
    });

    it('gradua a força igual às 4 barrinhas do protótipo', () => {
      expect(passwordStrength('')).toBe(0);
      expect(passwordStrength('abcdefgh')).toBe(1);
      expect(passwordStrength('senha123')).toBe(2);
      expect(passwordStrength('senha12345')).toBe(3);
      expect(passwordStrength('senha12345!')).toBe(4);
    });
  });

  describe('telefone', () => {
    it('normaliza o celular mascarado para E.164 sem "+"', () => {
      expect(normalizeMobilePhone('(16) 9 9999-0001')).toBe('5516999990001');
      expect(normalizeMobilePhone('16999990001')).toBe('5516999990001');
      expect(normalizeMobilePhone('+55 16 99999-0001')).toBe('5516999990001');
    });

    it('recusa celular incompleto', () => {
      expect(normalizeMobilePhone('(16) 9 9999-000')).toBeNull();
      expect(normalizeMobilePhone('')).toBeNull();
    });

    it('aceita fixo só onde fixo é aceito (telefone da barbearia)', () => {
      expect(normalizePhone('(11) 3333-4444')).toBe('551133334444');
      expect(normalizeMobilePhone('(11) 3333-4444')).toBeNull();
    });

    it('formata e mascara para exibição', () => {
      expect(formatPhone('5516999990001')).toBe('(16) 9 9999-0001');
      expect(formatPhone('551133334444')).toBe('(11) 3333-4444');
      expect(maskPhoneForDisplay('5516999990001')).toBe('(16) 9 ****-0001');
    });

    it('é idempotente: normalizar o que já está normalizado não muda nada', () => {
      const once = normalizeMobilePhone('(16) 9 9999-0001')!;
      expect(normalizeMobilePhone(once)).toBe(once);
    });
  });

  describe('e-mail mascarado', () => {
    it('preserva a primeira e a última letra e o domínio', () => {
      expect(maskEmailForDisplay('lucas.andrade@email.com')).toBe('l***********e@email.com');
    });

    it('não quebra com usuário curtíssimo', () => {
      expect(maskEmailForDisplay('ab@x.com')).toBe('ab@x.com');
      expect(maskEmailForDisplay('sem-arroba')).toBe('sem-arroba');
    });
  });

  describe('slug', () => {
    it('reproduz a normalização do wizard: minúsculas e [a-z0-9-]', () => {
      expect(slugify('Studio Navalha')).toBe('studio-navalha');
      expect(slugify('Barbearia Central')).toBe('barbearia-central');
      expect(slugify('  Barber  VP!!  ')).toBe('barber-vp');
    });

    it('remove acentos em vez de virar hífen', () => {
      expect(slugify('Barbearia São João')).toBe('barbearia-sao-joao');
      expect(slugify('Ação & Estilo')).toBe('acao-estilo');
    });

    it('nunca deixa hífen sobrando nas pontas', () => {
      expect(slugify('---teste---')).toBe('teste');
      expect(slugify('!!!')).toBe('');
    });

    it('valida o formato final', () => {
      expect(isValidSlug('studio-navalha')).toBe(true);
      expect(isValidSlug('ab')).toBe(false);
      expect(isValidSlug('-comeca-com-hifen')).toBe(false);
      expect(isValidSlug('termina-com-hifen-')).toBe(false);
      expect(isValidSlug('MAIUSCULA')).toBe(false);
    });
  });
});
