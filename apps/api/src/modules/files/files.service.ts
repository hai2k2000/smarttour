import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Client } from 'minio';

export type UploadFile = {
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
  const fileName = normalizeFileName(file.originalname);
  const mimeType = normalizeMimeType(file.mimetype);
  const extension = extname(fileName).toLowerCase();
  if (deniedExtensions.has(extension) || deniedMimeTypes.has(mimeType)) {
    throw new BadRequestException('Loại file không được phép tải lên');
  }
  return { fileName, mimeType };
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

function normalizeFileName(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Tên file không hợp lệ');
  const normalizedPath = value.normalize('NFC').replace(/\\/g, '/').trim();
  const fileName = basename(normalizedPath).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!fileName || fileName === '.' || fileName === '..') throw new BadRequestException('Tên file không hợp lệ');
  if (fileName.length > 255) throw new BadRequestException('Tên file không được vượt quá 255 ký tự');
  return fileName;
}

function normalizeMimeType(value: unknown) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new BadRequestException('MIME type của file không hợp lệ');
  const mimeType = String(value || 'application/octet-stream').split(';', 1)[0].trim().toLowerCase() || 'application/octet-stream';
  if (mimeType.length > 255 || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)) {
    throw new BadRequestException('MIME type của file không hợp lệ');
  }
  return mimeType;
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
    const normalized = this.normalizeUpload(file);
    await this.ensureBucket();

    const scope = this.safeScope(rawScope);
    const now = new Date();
    const objectKey = `${scope}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}-${this.safeFileName(normalized.originalname)}`;
    await this.client.putObject(this.bucket, objectKey, normalized.buffer, normalized.size, {
      'Content-Type': normalized.mimetype,
      'X-Amz-Meta-Original-Name': encodeURIComponent(normalized.originalname),
      'X-Amz-Meta-Original-Mime-Type': normalized.mimetype,
      'X-Amz-Meta-File-Size': String(normalized.size),
      ...(actorId ? { 'X-Amz-Meta-Uploaded-By': actorId } : {}),
    });

    return {
      bucket: this.bucket,
      objectKey,
      fileName: normalized.originalname,
      mimeType: normalized.mimetype,
      size: normalized.size,
      url: `/api/files/download?key=${encodeURIComponent(objectKey)}`,
    };
  }

  normalizeUpload(file: UploadFile | undefined): UploadFile {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('Cần chọn file để tải lên');
    const { fileName, mimeType } = assertAllowedUpload(file);
    const size = Number(file.size);
    if (!Number.isSafeInteger(size) || size <= 0 || file.buffer.length <= 0) {
      throw new BadRequestException('File tải lên không được để trống');
    }
    if (size !== file.buffer.length) {
      throw new BadRequestException('Kích thước file không khớp với nội dung tải lên');
    }
    if (size > this.maxBytes) throw new BadRequestException(`File vượt quá giới hạn ${this.maxBytes} bytes`);
    return { originalname: fileName, mimetype: mimeType, size, buffer: file.buffer };
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
    const rawExtension = extname(value).toLowerCase();
    const extension = /^\.[a-z0-9]{1,20}$/.test(rawExtension) ? rawExtension : '';
    const stem = basename(value, extname(value)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${stem || 'file'}${extension}`;
  }

  private requiredObjectKey(value?: string) {
    const key = value?.trim();
    if (!key || key.includes('..') || !/^[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]{1,20})?$/.test(key)) throw new BadRequestException('Object key không hợp lệ');
    return key;
  }
}
