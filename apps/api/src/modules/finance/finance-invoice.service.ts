import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';
import { FinanceService } from './finance.service';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinanceInvoiceService {
  constructor(private readonly finance: FinanceService) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listInvoices(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.invoiceDetail(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadInvoiceFile(id, file, actorId, user);
  }

  deleteFile(id: string, fileId: string, user?: RequestUser) {
    return this.finance.deleteInvoiceFile(id, fileId, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createInvoice(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updateInvoice(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deleteInvoice(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approveInvoice(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectInvoice(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelInvoice(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportInvoices(query, user);
  }
}
