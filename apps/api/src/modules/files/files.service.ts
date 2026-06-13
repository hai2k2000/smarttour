import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Client } from 'minio';
import { PrismaService } from '../../database/prisma.service';
import { branchDepartmentScopeWhere, hasUnrestrictedDataScope, RequestUser, userPermissions } from '../auth/data-scope';

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

type FileAccessAction = 'view' | 'manage';

const allowedExtensions = new Set([
  '.bmp', '.csv', '.doc', '.docx', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.ods', '.odt', '.pdf', '.png',
  '.rar', '.rtf', '.tif', '.tiff', '.txt', '.webp', '.xls', '.xlsx', '.zip',
]);
const allowedMimeTypes = new Set([
  'application/csv',
  'application/msword',
  'application/octet-stream',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-rar-compressed',
  'application/zip',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'text/csv',
  'text/plain',
]);
const defaultMaxBytes = 10 * 1024 * 1024;

export function fileUploadMaxBytes() {
  const configured = Number(process.env.FILE_UPLOAD_MAX_BYTES || defaultMaxBytes);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultMaxBytes;
}

export function fileUploadLimitLabel(maxBytes = fileUploadMaxBytes()) {
  const megabytes = maxBytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${maxBytes} bytes`;
}

export function assertAllowedUpload(file: Pick<UploadFile, 'originalname' | 'mimetype'>) {
  const fileName = normalizeFileName(file.originalname);
  const mimeType = normalizeMimeType(file.mimetype);
  const extension = extname(fileName).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new BadRequestException('Định dạng file không được phép tải lên. Chỉ hỗ trợ tài liệu, bảng tính, ảnh, file nén và file văn bản phổ biến.');
  }
  if (!allowedMimeTypes.has(mimeType)) {
    throw new BadRequestException('MIME type của file không được phép tải lên. Vui lòng chọn tài liệu, bảng tính, ảnh, file nén hoặc file văn bản hợp lệ.');
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

  constructor(private readonly prisma: PrismaService) {
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
    if (size > this.maxBytes) throw new BadRequestException(`File vượt quá giới hạn ${fileUploadLimitLabel(this.maxBytes)}`);
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

  async downloadAuthorized(objectKey: string | undefined, user?: RequestUser) {
    await this.assertObjectAccess(objectKey, user, 'view');
    return this.download(objectKey);
  }

  async remove(objectKey?: string) {
    const key = this.requiredObjectKey(objectKey);
    await this.client.removeObject(this.bucket, key);
    return { deleted: true, objectKey: key };
  }

  async removeAuthorized(objectKey: string | undefined, user?: RequestUser) {
    await this.assertObjectAccess(objectKey, user, 'manage');
    return this.remove(objectKey);
  }

  async assertObjectAccess(objectKey: string | undefined, user: RequestUser | undefined, action: FileAccessAction) {
    const key = this.requiredObjectKey(objectKey);
    const parts = key.split('/');
    const root = parts[0];
    const entityId = parts[1];
    if (!entityId) throw this.fileAccessNotFound();

    if (root === 'customers') return this.assertCustomerFile(key, entityId, user, action);
    if (root === 'suppliers') return this.assertSupplierFile(key, entityId, user, action);
    if (root === 'tour-guides') return this.assertGuideFile(key, entityId, user, action);
    if (root === 'fit-tours') return this.assertFitTourFile(key, entityId, user, action);
    if (root === 'finance') return this.assertFinanceFile(key, parts[1], parts[2], user, action);
    throw this.fileAccessNotFound();
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
      const key = new URL(fileUrl, 'http://smarttour.local').searchParams.get('key');
      return key ? this.requiredObjectKey(key) : null;
    } catch {
      return null;
    }
  }

  private async assertCustomerFile(key: string, customerId: string, user: RequestUser | undefined, action: FileAccessAction) {
    this.assertPermission(user, action === 'view' ? 'customer.view' : 'customer.manage');
    const [parent, metadata] = await Promise.all([
      this.prisma.customer.findFirst({
        where: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ id: customerId, mergedIntoId: null }, user),
        select: { id: true },
      }),
      this.prisma.customerFile.findMany({ where: { customerId }, select: { id: true, fileUrl: true } }),
    ]);
    this.assertParentAndMetadata(parent, this.metadataForKey(metadata, key));
  }

  private async assertSupplierFile(key: string, supplierId: string, user: RequestUser | undefined, action: FileAccessAction) {
    this.assertPermission(user, action === 'view' ? 'supplier.view' : 'supplier.manage');
    const [parent, metadata] = await Promise.all([
      this.prisma.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { id: true } }),
      this.prisma.supplierFile.findMany({ where: { supplierId }, select: { id: true, fileUrl: true } }),
    ]);
    this.assertParentAndMetadata(parent, this.metadataForKey(metadata, key));
  }

  private async assertGuideFile(key: string, guideId: string, user: RequestUser | undefined, action: FileAccessAction) {
    this.assertPermission(user, action === 'view' ? 'guide.view' : 'guide.manage');
    const [parent, metadata] = await Promise.all([
      this.prisma.guideProfile.findFirst({ where: { id: guideId, deletedAt: null }, select: { id: true } }),
      this.prisma.guideFile.findMany({ where: { guideId }, select: { id: true, fileUrl: true } }),
    ]);
    this.assertParentAndMetadata(parent, this.metadataForKey(metadata, key));
  }

  private async assertFitTourFile(key: string, fitTourId: string, user: RequestUser | undefined, action: FileAccessAction) {
    this.assertPermission(user, action === 'view' ? 'tour.view' : 'tour.manage');
    const parent = await this.prisma.fitTour.findFirst({
      where: this.fitTourScopeWhere({ id: fitTourId }, user),
      select: { id: true, tourId: true },
    });
    if (!parent) throw this.fileAccessNotFound();
    const [legacyMetadata, rootMetadata] = await Promise.all([
      this.prisma.fitAttachment.findMany({ where: { fitTourId }, select: { id: true, fileUrl: true } }),
      parent.tourId
        ? this.prisma.tourAttachment.findMany({ where: { tourId: parent.tourId }, select: { id: true, fileUrl: true } })
        : Promise.resolve([]),
    ]);
    if (!this.metadataForKey([...legacyMetadata, ...rootMetadata], key)) throw this.fileAccessNotFound();
  }

  private async assertFinanceFile(
    key: string,
    type: string | undefined,
    entityId: string | undefined,
    user: RequestUser | undefined,
    action: FileAccessAction,
  ) {
    if (!entityId) throw this.fileAccessNotFound();
    if (type === 'receipts') {
      this.assertPermission(user, action === 'view' ? 'finance.receipt.view' : 'finance.receipt.update');
      const parent = await this.prisma.financeReceipt.findFirst({
        where: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ id: entityId, deletedAt: null }, user),
        select: { id: true, attachmentUrl: true },
      });
      if (!parent || !this.fileUrlMatchesKey(parent.attachmentUrl, key)) throw this.fileAccessNotFound();
      return;
    }
    if (type === 'payments') {
      this.assertPermission(user, action === 'view' ? 'finance.payment.view' : 'finance.payment.update');
      const parent = await this.prisma.financePayment.findFirst({
        where: branchDepartmentScopeWhere<Prisma.FinancePaymentWhereInput>({ id: entityId, deletedAt: null }, user),
        select: { id: true, attachmentUrl: true },
      });
      if (!parent || !this.fileUrlMatchesKey(parent.attachmentUrl, key)) throw this.fileAccessNotFound();
      return;
    }
    if (type === 'invoices') {
      this.assertPermission(user, action === 'view' ? 'finance.invoice.view' : 'finance.invoice.update');
      const [parent, metadata] = await Promise.all([
        this.prisma.financeInvoice.findFirst({ where: this.invoiceScopeWhere({ id: entityId, deletedAt: null }, user), select: { id: true } }),
        this.prisma.financeInvoiceFile.findMany({ where: { invoiceId: entityId }, select: { id: true, fileUrl: true } }),
      ]);
      this.assertParentAndMetadata(parent, this.metadataForKey(metadata, key));
      return;
    }
    throw this.fileAccessNotFound();
  }

  private fitTourScopeWhere(where: Prisma.FitTourWhereInput, user?: RequestUser): Prisma.FitTourWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return { AND: [where, { tour: { is: { deletedAt: null } } }] };
    return {
      AND: [
        where,
        { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
      ],
    };
  }

  private invoiceScopeWhere(where: Prisma.FinanceInvoiceWhereInput, user?: RequestUser): Prisma.FinanceInvoiceWhereInput {
    if (!user || hasUnrestrictedDataScope(user)) return where;
    return {
      AND: [
        where,
        {
          OR: [
            { customer: { is: branchDepartmentScopeWhere<Prisma.CustomerWhereInput>({ mergedIntoId: null }, user) } },
            { order: { is: branchDepartmentScopeWhere<Prisma.OrderWhereInput>({ deletedAt: null }, user) } },
            { tour: { is: branchDepartmentScopeWhere<Prisma.TourWhereInput>({ deletedAt: null }, user) } },
            { receipt: { is: branchDepartmentScopeWhere<Prisma.FinanceReceiptWhereInput>({ deletedAt: null }, user) } },
          ],
        },
      ],
    };
  }

  private assertPermission(user: RequestUser | undefined, permission: string) {
    const permissions = userPermissions(user);
    if (!user || (!permissions.has('*') && !permissions.has(permission))) throw new ForbiddenException('Thiếu quyền truy cập entity chứa file');
  }

  private assertParentAndMetadata(parent: unknown, metadata: unknown) {
    if (!parent || !metadata) throw this.fileAccessNotFound();
  }

  private metadataForKey<T extends { fileUrl: string | null }>(rows: T[], key: string) {
    return rows.find((row) => this.fileUrlMatchesKey(row.fileUrl, key));
  }

  private fileUrlMatchesKey(fileUrl: string | null | undefined, key: string) {
    return fileUrl === this.fileUrl(key) || this.objectKeyFromUrl(fileUrl) === key;
  }

  private fileUrl(key: string) {
    return `/api/files/download?key=${encodeURIComponent(key)}`;
  }

  private fileAccessNotFound() {
    return new NotFoundException('Không tìm thấy file hoặc không có quyền truy cập');
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
