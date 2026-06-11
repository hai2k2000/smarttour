import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';
import { FinanceService } from './finance.service';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class FinanceLedgerService {
  constructor(private readonly finance: FinanceService) {}

  customerDebt(query: Record<string, string>, user?: RequestUser) {
    return this.finance.customerDebt(query, user);
  }

  supplierDebt(query: Record<string, string>, user?: RequestUser) {
    return this.finance.supplierDebt(query, user);
  }

  createCustomerAdjustment(customerId: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.createCustomerDebtAdjustment(customerId, dto, user);
  }

  createSupplierAdjustment(supplierId: string, dto: AnyRecord, user?: RequestUser) {
    return this.finance.createSupplierDebtAdjustment(supplierId, dto, user);
  }
}
