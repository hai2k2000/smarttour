import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Client } from 'minio';

type UploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type StoredFileUpload = {
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
};

const deniedExtensions = new Set(['.bat', '.cmd', '.com', '.exe', '.htm', '.html', '.js', '.mjs', '.cjs', '.ps1', '.sh', '.svg']);
const deniedMimeTypes = new Set(['image/svg+xml', 'text/html', 'text/javascript', 'application/javascript']);
const defaultMaxBytes = 10 * 1024 * 1024;

export function fileUploadMaxBytes() {
  const configured = Number(process.env.FILE_UPLOAD_MAX_BYTES || defaultMaxBytes);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultMaxBytes;
}

export function assertAllowedUpload(file: Pick<UploadFile, 'originalname' | 'mimetype'>) {
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
  if (deniedExtensions.has(extension) || deniedMimeTypes.has(mimeType)) {
    throw new BadRequestException('Loại file không được phép tải lên');
  }
}

export function fileUploadInterceptorOptions() {
  const maxBytes = fileUploadMaxBytes();
  return {
    limits: { fileSize: maxBytes },
    fileFilter: (_request: unknown, file: Pick<UploadFile, 'originalname' | 'mimetype'>, callback: (error: Error | null, acceptFile: boolean) => void) => {
      try {
        assertAllowedUpload(file);
        callback(null, true);
      } catch (error) {
        callback(error as Error, false);
      }
    },
  };
}

@Injectable()
export class FilesService {
  private readonly bucket = process.env.MINIO_BUCKET || 'smarttour';
  private readonly maxBytes = fileUploadMaxBytes();
  private readonly client: Client;

  constructor() {
    const endpoint = new URL(process.env.MINIO_ENDPOINT || 'http://localhost:9000');
    this.client = new Client({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
      useSSL: endpoint.protocol === 'https:',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
    });
  }

  async upload(file: UploadFile | undefined, rawScope?: string, actorId?: string): Promise<StoredFileUpload> {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('Cần chọn file để tải lên');
    if (!file.size || file.size > this.maxBytes) throw new BadRequestException(`File vượt quá giới hạn ${this.maxBytes} bytes`);
    assertAllowedUpload(file);
    await this.ensureBucket();

    const scope = this.safeScope(rawScope);
    const now = new Date();
    const objectKey = `${scope}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}-${this.safeFileName(file.originalname)}`;
    await this.client.putObject(this.bucket, objectKey, file.buffer, file.size, {
      'Content-Type': file.mimetype || 'application/octet-stream',
      'X-Amz-Meta-Original-Name': encodeURIComponent(file.originalname),
      ...(actorId ? { 'X-Amz-Meta-Uploaded-By': actorId } : {}),
    });

    return {
      bucket: this.bucket,
      objectKey,
      fileName: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      url: `/api/files/download?key=${encodeURIComponent(objectKey)}`,
    };
  }

  async download(objectKey?: string) {
    const key = this.requiredObjectKey(objectKey);
    try {
      const stat = await this.client.statObject(this.bucket, key);
      const stream = await this.client.getObject(this.bucket, key);
      const encodedName = stat.metaData?.['x-amz-meta-original-name'];
      return {
        stream,
        size: stat.size,
        mimeType: stat.metaData?.['content-type'] || 'application/octet-stream',
        fileName: encodedName ? decodeURIComponent(encodedName) : basename(key),
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NoSuchKey' || code === 'NotFound') throw new NotFoundException('Không tìm thấy file');
      throw error;
    }
  }

  async remove(objectKey?: string) {
    const key = this.requiredObjectKey(objectKey);
    await this.client.removeObject(this.bucket, key);
    return { deleted: true, objectKey: key };
  }

  async removeIfPresent(objectKey?: string | null) {
    if (!objectKey) return { deleted: false, objectKey: null };
    return this.remove(objectKey);
  }

  async removeQuietly(objectKey?: string | null) {
    if (!objectKey) return;
    await this.remove(objectKey).catch(() => undefined);
  }

  objectKeyFromUrl(fileUrl?: string | null) {
    if (!fileUrl) return null;
    try {
      return new URL(fileUrl, 'http://smarttour.local').searchParams.get('key');
    } catch {
      return null;
    }
  }

  private async ensureBucket() {
    if (await this.client.bucketExists(this.bucket)) return;
    try {
      await this.client.makeBucket(this.bucket);
    } catch (error) {
      if (!(await this.client.bucketExists(this.bucket))) throw error;
    }
  }

  private safeScope(value?: string) {
    const scope = (value || 'common').trim().replace(/[^a-zA-Z0-9/_-]+/g, '-').replace(/^\/+|\/+$/g, '');
    return scope || 'common';
  }

  private safeFileName(value: string) {
    const extension = extname(value).toLowerCase();
    const stem = basename(value, extname(value)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${stem || 'file'}${extension}`;
  }

  private requiredObjectKey(value?: string) {
    const key = value?.trim();
    if (!key || key.includes('..') || !/^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(key)) throw new BadRequestException('Object key không hợp lệ');
    return key;
  }
}
