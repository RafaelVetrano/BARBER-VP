export const STORAGE_ADAPTER = 'STORAGE_ADAPTER';

/** Tipos que o produto aceita hoje — logo, capa e galeria são fotos. */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/** Extensão canônica por MIME — nunca confiar no nome que o browser mandou. */
export const IMAGE_EXTENSION: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Teto por arquivo (bytes). Foto de celular cabe; PDF disfarçado, não. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PutObjectParams {
  /**
   * Pasta lógica — SEMPRE começa pelo `tenantId`, para que o objeto de uma
   * barbearia nunca caia no espaço de outra nem no driver local nem no S3.
   */
  tenantId: string;
  /** `logo`, `capa`, `galeria` — segundo nível do caminho. */
  folder: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StoredObject {
  /** Caminho interno, o que se guarda para poder apagar depois. */
  key: string;
  /** URL absoluta servível ao browser. */
  url: string;
}

/**
 * Contrato de armazenamento de arquivo.
 *
 * Existe pelo mesmo motivo de `NOTIFICATION_ADAPTER`/`PAYMENT_ADAPTER`: o
 * módulo de negócio grava uma imagem e recebe uma URL, sem saber se do outro
 * lado está o disco do container (dev) ou um bucket S3/R2 (produção). Trocar é
 * um `case` na factory de `AdaptersModule` — `MyPageService` não muda.
 */
export interface StorageAdapter {
  put(params: PutObjectParams): Promise<StoredObject>;

  /**
   * Apaga o objeto. Silencioso quando a chave não existe mais: remover foto é
   * operação idempotente, e um arquivo já ausente não pode derrubar o DELETE
   * da linha no banco.
   */
  remove(key: string): Promise<void>;

  /**
   * Converte a URL pública de volta na chave, ou `null` quando a URL não é
   * deste storage (as `logoUrl` digitadas à mão que existem desde a fase 03).
   * É o que impede o `remove` de tentar apagar imagem de terceiro.
   */
  keyFromUrl(url: string): string | null;
}
