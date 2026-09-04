import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidUf } from '@barbervp/types';

/**
 * Sigla de uma das 27 unidades federativas.
 *
 * A lista mora em `@barbervp/types` (`BRAZIL_UFS`), que é a mesma que alimenta
 * o seletor do passo 2 — o campo não pode aceitar uma UF que a tela não
 * oferece, nem recusar uma que ela oferece.
 */
export function IsBrazilUf(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isBrazilUf',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidUf(value),
        defaultMessage: () => 'UF inválida — use a sigla de 2 letras (ex.: SP).',
      },
    });
  };
}
