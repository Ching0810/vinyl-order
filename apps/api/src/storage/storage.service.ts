import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Result of storing a file: the public URL to persist on Product.imageUrl. */
export interface StoredFile {
  url: string;
}

/**
 * Abstracts WHERE uploaded images live. This is both the DI token and the
 * contract — swap the implementation (local disk in dev, GCS in prod) without
 * touching the controllers that call it.
 */
export abstract class StorageService {
  abstract save(file: Express.Multer.File): Promise<StoredFile>;
}

/** Fallback extensions when the upload has no filename extension. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Dev storage: writes to a local folder under the API (`UPLOAD_DIR`), served
 * back via the `/uploads` static route (see main.ts). Not for production —
 * Cloud Run's filesystem is ephemeral; prod uses a GcsStorageService.
 */
@Injectable()
export class LocalStorageService extends StorageService {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async save(file: Express.Multer.File): Promise<StoredFile> {
    const dir = resolve(process.cwd(), this.config.get<string>('UPLOAD_DIR') ?? './uploads');
    const ext = extname(file.originalname) || MIME_EXT[file.mimetype] || '';
    const filename = `${randomUUID()}${ext}`;

    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, filename), file.buffer);

    const base = this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3001';
    return { url: `${base}/uploads/${filename}` };
  }
}
