import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '@barbervp/types';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { ApiException } from '../../common/errors/api.exception';
import {
  ALLOWED_IMAGE_MIME,
  IMAGE_EXTENSION,
  MAX_IMAGE_BYTES,
  type AllowedImageMime,
  type PutObjectParams,
  type StorageAdapter,
  type StoredObject,
} from './storage.adapter';

/**
 * Driver de desenvolvimento: grava no disco do container e serve por
 * `GET {publicBaseUrl}/uploads/...` (estático registrado em `main.ts`).
 *
 * Não serve para produção com mais de uma réplica — o arquivo fica na máquina
 * que recebeu o POST. É exatamente por isso que o serviço fala com a interface
 * `StorageAdapter` e não com esta classe: o dia do S3/R2 é um binding.
 */
@Injectable()
export class LocalStorageDriver implements StorageAdapter {
  private readonly root: string;
  private readonly publicPrefix: string;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LocalStorageDriver.name);
    this.root = resolve(config.storage.localDir);
    this.publicPrefix = `${config.storage.publicBaseUrl}/${config.storage.publicPath}`;
  }

  async put({ tenantId, folder, mimeType, buffer }: PutObjectParams): Promise<StoredObject> {
    if (!ALLOWED_IMAGE_MIME.includes(mimeType as AllowedImageMime)) {
      throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, {
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'Formato não suportado. Envie JPG, PNG ou WebP.',
      });
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, {
        code: ErrorCode.FILE_TOO_LARGE,
        message: 'Imagem acima de 5 MB.',
      });
    }

    // Nome aleatório: o do browser é entrada do usuário (`../../etc/passwd`) e
    // reaproveitá-lo ainda deixaria um upload sobrescrever o anterior.
    const extension = IMAGE_EXTENSION[mimeType as AllowedImageMime];
    const key = `${tenantId}/${folder}/${randomBytes(16).toString('hex')}.${extension}`;
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);

    return { key, url: `${this.publicPrefix}/${key}` };
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      // Arquivo ausente não é erro: quem chama já apagou a linha do banco.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn({ key, error }, 'falha ao remover objeto do storage local');
      }
    }
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicPrefix}/`;
    if (!url.startsWith(prefix)) {
      return null;
    }
    const key = url.slice(prefix.length);
    // Revalida pelo mesmo caminho do `put` — uma URL forjada com `..` não pode
    // virar chave de escrita/remoção fora da raiz.
    try {
      this.resolveKey(key);
    } catch {
      return null;
    }
    return key;
  }

  /** Resolve a chave dentro da raiz e recusa qualquer escape (`..`). */
  private resolveKey(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw ApiException.badRequest('Caminho de arquivo inválido.');
    }
    return target;
  }
}
