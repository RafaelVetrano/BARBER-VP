import { registerDecorator, type ValidationOptions } from 'class-validator';
import { PASSWORD_RULE_MESSAGE, isPasswordValid } from '@barbervp/types';

/**
 * Regra de senha: mínimo 8 caracteres, com maiúscula, número e caractere
 * especial (2026-09-04). São QUATRO requisitos — minúscula não entra.
 *
 * Delega para `isPasswordValid` de `@barbervp/types`, a MESMA função que o
 * formulário usa no navegador — então o campo nunca fica verde e o servidor
 * devolve 400. A frase da recusa também vem de lá (`PASSWORD_RULE_MESSAGE`),
 * para que os dois lados não só concordem na decisão como no texto.
 */
export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isPasswordValid(value),
        defaultMessage: () => PASSWORD_RULE_MESSAGE,
      },
    });
  };
}
