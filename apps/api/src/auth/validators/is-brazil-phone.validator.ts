import { registerDecorator, type ValidationOptions } from 'class-validator';
import { normalizeMobilePhone, normalizePhone } from '@barbervp/types';

/**
 * Celular brasileiro (DDD + 9 dígitos), aceito com ou sem máscara — a tela
 * manda `(16) 9 9999-9001` e a normalização para E.164 acontece no serviço.
 *
 * `allowLandline` libera 10 dígitos, usado no telefone da barbearia (que pode
 * ser fixo); a identidade do cliente exige celular, porque é por ali que o OTP
 * e os lembretes de WhatsApp saem.
 */
export function IsBrazilPhone(
  options?: ValidationOptions & { allowLandline?: boolean },
): PropertyDecorator {
  const allowLandline = options?.allowLandline ?? false;

  return (target, propertyName) => {
    registerDecorator({
      name: 'isBrazilPhone',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          return (allowLandline ? normalizePhone(value) : normalizeMobilePhone(value)) !== null;
        },
        defaultMessage: () =>
          allowLandline
            ? 'Telefone inválido — informe DDD e número.'
            : 'Celular inválido — informe DDD e 9 dígitos.',
      },
    });
  };
}
