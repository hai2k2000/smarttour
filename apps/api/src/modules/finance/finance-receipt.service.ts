import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';
import { FinanceService } from './finance.service';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinanceReceiptService {
  constructor(private readonly finance: FinanceService) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listReceipts(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.receiptDetail(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadReceiptFile(id, file, actorId, user);
  }

  deleteFile(id: string, user?: RequestUser) {
    return this.finance.deleteReceiptFile(id, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createReceipt(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updateReceipt(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deleteReceipt(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approveReceipt(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectReceipt(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelReceipt(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportReceipts(query, user);
  }

  exportXlsx(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportReceiptsXlsx(query, user);
  }

  import(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    return this.finance.importReceipts(dto, file, user);
  }
}
