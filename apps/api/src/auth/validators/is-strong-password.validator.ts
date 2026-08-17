import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isPasswordValid } from '@barbervp/types';

/**
 * Regra de senha do protótipo: mínimo 8 caracteres, com letra e número.
 *
 * Delega para `isPasswordValid` de `@barbervp/types`, a MESMA função que o
 * formulário usa no navegador — então o campo nunca fica verde e o servidor
 * devolve 400.
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
        defaultMessage: () => 'A senha precisa de no mínimo 8 caracteres, com letra e número.',
      },
    });
  };
}
