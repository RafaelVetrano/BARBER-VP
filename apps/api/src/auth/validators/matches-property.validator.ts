import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

/**
 * Confere que o campo repete OUTRO campo do mesmo corpo — os pares "confirmar
 * e-mail" e "confirmar senha" do Cadastro Estabelecimento (agente 32).
 *
 * A tela já compara os dois antes de enviar; isto é a regra 1 do kit aplicada
 * ao par: o servidor é a autoridade e recusa um POST montado à mão, sem
 * depender de o navegador ter feito a checagem.
 *
 * A comparação usa o valor JÁ transformado pelo `@Transform` do DTO, então
 * "confirmar e-mail" bate depois do `trim().toLowerCase()` dos dois lados —
 * `Voce@Email.com` confirma `voce@email.com`, que é o que o usuário espera.
 */
export function MatchesProperty(property: string, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'matchesProperty',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      options,
      validator: {
        validate: (value: unknown, args: ValidationArguments) =>
          value === (args.object as Record<string, unknown>)[args.constraints[0] as string],
        defaultMessage: () => 'Os campos não coincidem.',
      },
    });
  };
}
