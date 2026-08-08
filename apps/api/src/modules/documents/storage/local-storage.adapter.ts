import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface StoredFile {
  storageProvider: string;
  storagePath: string;
}

/**
 * Interface-first so an S3 adapter can replace `LocalStorageAdapter`
 * later without `DocumentsService` changing.
 */
export interface StorageAdapter {
  save(buffer: Buffer): Promise<StoredFile>;
  // Admin-only read path (moderation download) — `storagePath` always
  // comes from a `files` row already resolved via `FileEntity`, never
  // from unvalidated user input, so this doesn't reopen the path-
  // traversal concern `save()`'s docblock describes.
  read(storagePath: string): Promise<Buffer>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');

/**
 * Writes uploaded files to disk under `STORAGE_ROOT` — a directory
 * that must sit outside anything Express/Nest serves statically, so a
 * stored PDF is never reachable by guessing a URL.
 *
 * The on-disk filename is always a generated UUID, never the
 * caller's original filename, so a hostile filename (path traversal,
 * embedded script) never reaches the filesystem.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root = resolve(process.env.STORAGE_ROOT ?? './storage');

  async save(buffer: Buffer): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    const storagePath = join(this.root, key);
    await writeFile(storagePath, buffer);
    return { storageProvider: 'local', storagePath };
  }

  read(storagePath: string): Promise<Buffer> {
    return readFile(storagePath);
  }
}
