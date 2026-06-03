import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;
type ImportFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class FinancePaymentService {
  constructor(private readonly finance: any) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.listPaymentsCore(query, user);
  }

  detail(id: string, user?: RequestUser) {
    return this.finance.paymentDetailCore(id, user);
  }

  uploadFile(id: string, file: ImportFile | undefined, actorId?: string, user?: RequestUser) {
    return this.finance.uploadPaymentFileCore(id, file, actorId, user);
  }

  deleteFile(id: string, user?: RequestUser) {
    return this.finance.deletePaymentFileCore(id, user);
  }

  create(dto: AnyRecord, user?: RequestUser) {
    return this.finance.createPaymentCore(dto, user);
  }

  update(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.updatePaymentCore(id, dto, user);
  }

  delete(id: string, user?: RequestUser) {
    return this.finance.deletePaymentCore(id, user);
  }

  approve(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.approvePaymentCore(id, dto, user);
  }

  reject(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.rejectPaymentCore(id, dto, user);
  }

  cancel(id: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.cancelPaymentCore(id, dto, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportPaymentsCore(query, user);
  }

  import(dto: AnyRecord, file?: ImportFile, user?: RequestUser) {
    return this.finance.importPaymentsCore(dto, file, user);
  }
}
