import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinanceReceiptService {
  constructor(private readonly finance: any) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listReceiptsCore(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.receiptDetailCore(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadReceiptFileCore(id, file, actorId, user);
  }

  deleteFile(id: string, user?: RequestUser) {
    return this.finance.deleteReceiptFileCore(id, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createReceiptCore(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updateReceiptCore(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deleteReceiptCore(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approveReceiptCore(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectReceiptCore(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelReceiptCore(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportReceiptsCore(query, user);
  }

  import(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    return this.finance.importReceiptsCore(dto, file, user);
  }
}
