import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';
import { FinanceService } from './finance.service';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinancePaymentService {
  constructor(private readonly finance: FinanceService) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listPayments(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.paymentDetail(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadPaymentFile(id, file, actorId, user);
  }

  deleteFile(id: string, user?: RequestUser) {
    return this.finance.deletePaymentFile(id, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createPayment(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updatePayment(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deletePayment(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approvePayment(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectPayment(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelPayment(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportPayments(query, user);
  }

  exportXlsx(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportPaymentsXlsx(query, user);
  }

  import(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    return this.finance.importPayments(dto, file, user);
  }
}
