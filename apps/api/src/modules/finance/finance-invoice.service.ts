import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinanceInvoiceService {
  constructor(private readonly finance: any) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listInvoicesCore(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.invoiceDetailCore(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadInvoiceFileCore(id, file, actorId, user);
  }

  deleteFile(id: string, fileId: string, user?: RequestUser) {
    return this.finance.deleteInvoiceFileCore(id, fileId, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createInvoiceCore(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updateInvoiceCore(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deleteInvoiceCore(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approveInvoiceCore(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectInvoiceCore(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelInvoiceCore(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportInvoicesCore(query, user);
  }
}
