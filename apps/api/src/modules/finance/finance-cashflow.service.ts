import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';
import { FinanceService } from './finance.service';

@Injectable()
export class FinanceCashflowService {
  constructor(private readonly finance: FinanceService) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.cashflow(query, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportCashflow(query, user);
  }
}
