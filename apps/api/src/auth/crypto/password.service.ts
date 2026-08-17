import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com argon2id (SPEC.md → Segurança).
 *
 * Parâmetros: 19 MiB / 2 iterações / 1 thread — o perfil de segunda escolha da
 * recomendação do OWASP para argon2id, e os MESMOS do `prisma/seed.ts`, senão
 * as contas de desenvolvimento não abririam.
 */
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/**
 * Hash descartável usado quando o e-mail do login não existe. Sem ele, "usuário
 * inexistente" responde na hora e "senha errada" responde depois do argon2 —
 * diferença de tempo suficiente para enumerar contas.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YmFyYmVydnAtZHVtbXktc2FsdA$Q0y1sV9r3xw0h1FCTMhpJ3Y0RC5pP6TAcv6z1kW3T5A';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON_OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain, ARGON_OPTIONS);
    } catch {
      // Hash corrompido ou de outro algoritmo: trata como senha errada, não 500.
      return false;
    }
  }

  /** Queima o mesmo tempo de um `verify` real, para não vazar se a conta existe. */
  async burn(plain: string): Promise<void> {
    await this.verify(DUMMY_HASH, plain);
  }
}
