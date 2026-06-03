import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly finance: any) {}

  customerDebt(query: Record<string, string>, user?: RequestUser) {
    return this.finance.customerDebtCore(query, user);
  }

  supplierDebt(query: Record<string, string>, user?: RequestUser) {
    return this.finance.supplierDebtCore(query, user);
  }

  createCustomerAdjustment(customerId: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.createCustomerDebtAdjustmentCore(customerId, dto, user);
  }

  createSupplierAdjustment(supplierId: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.createSupplierDebtAdjustmentCore(supplierId, dto, user);
  }
}
