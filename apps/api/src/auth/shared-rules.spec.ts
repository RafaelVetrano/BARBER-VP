import {
  PASSWORD_SPECIAL_CHARS,
  formatPhone,
  isPasswordValid,
  passwordChecks,
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
  /**
   * Regra de 2026-09-04 (agente 32): 8+ caracteres, com MAIÚSCULA, NÚMERO e
   * CARACTERE ESPECIAL. São exatamente QUATRO requisitos — minúscula não é um
   * deles, e estes testes existem para que ninguém acrescente o quinto sem
   * perceber que está mudando uma decisão do dono do produto.
   *
   * Os casos que a regra ANTIGA aceitava (`senha123`, `minhasenha123`) ficaram
   * aqui de propósito, agora do lado das recusas: eles são a prova de que a
   * regra apertou, e não um resto do enunciado velho.
   */
  describe('senha', () => {
    it('aceita quando os quatro requisitos estão presentes', () => {
      expect(isPasswordValid('Senha@123')).toBe(true);
      expect(isPasswordValid('MinhaSenha@2026')).toBe(true);
    });

    it('aceita SEM minúscula — são quatro requisitos, não cinco', () => {
      // A decisão do dono do produto em 2026-09-04, fixada em teste: se alguém
      // acrescentar `/[a-z]/` a `isPasswordValid`, esta linha reprova.
      expect(isPasswordValid('SENHA@2026')).toBe(true);
      expect(passwordChecks('SENHA@2026')).toEqual({
        length: true,
        upper: true,
        digit: true,
        special: true,
      });
    });

    it('recusa o que a regra ANTIGA aceitava — sem maiúscula e sem especial', () => {
      expect(isPasswordValid('senha123')).toBe(false);
      expect(isPasswordValid('minhasenha123')).toBe(false);
    });

    it('recusa cada requisito isolado que falte', () => {
      expect(isPasswordValid('Se@12')).toBe(false); // curta demais
      expect(isPasswordValid('senha@123')).toBe(false); // sem maiúscula
      expect(isPasswordValid('SenhaSenha@')).toBe(false); // sem número
      expect(isPasswordValid('SenhaSenha1')).toBe(false); // sem especial
    });

    it('detalha QUAL requisito falta — é o que a tela desenha em ✓/○', () => {
      expect(passwordChecks('senha')).toEqual({
        length: false,
        upper: false,
        digit: false,
        special: false,
      });
      expect(passwordChecks('SenhaSenha1')).toEqual({
        length: true,
        upper: true,
        digit: true,
        special: false,
      });
    });

    it('trata acento como LETRA, nunca como caractere especial', () => {
      // `ç`/`ã` são letras: sozinhas não satisfazem o requisito de especial.
      expect(passwordChecks('Senhaç123').special).toBe(false);
      expect(isPasswordValid('Senhaç123')).toBe(false);
      // Maiúscula acentuada é maiúscula de verdade.
      expect(passwordChecks('çasa@2026').upper).toBe(false);
      expect(passwordChecks('Çasa@2026').upper).toBe(true);
    });

    it('aceita TODOS os caracteres da lista documentada', () => {
      for (const char of PASSWORD_SPECIAL_CHARS) {
        expect(passwordChecks(`Senha123${char}`).special).toBe(true);
      }
      // Espaço fica de fora de propósito.
      expect(passwordChecks('Senha123 ').special).toBe(false);
    });

    it('gradua a força como "quantos dos 4 requisitos" — barras e lista batem', () => {
      expect(passwordStrength('')).toBe(0);
      expect(passwordStrength('abcdefgh')).toBe(1); // só comprimento
      expect(passwordStrength('senha123')).toBe(2); // comprimento + dígito
      expect(passwordStrength('Senha123')).toBe(3); // falta o especial
      expect(passwordStrength('Senha@123')).toBe(4); // os quatro
    });

    it('força 4 e senha válida são a MESMA coisa — a régua não decora', () => {
      for (const candidate of ['Senha@123', 'SENHA@2026', 'senha123', 'Senha123', 'Se@1', '']) {
        expect(passwordStrength(candidate) === 4).toBe(isPasswordValid(candidate));
      }
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
