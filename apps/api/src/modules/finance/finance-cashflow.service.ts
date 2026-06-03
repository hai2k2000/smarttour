import { Injectable } from '@nestjs/common';
import { RequestUser } from '../auth/data-scope';

@Injectable()
export class FinanceCashflowService {
  constructor(private readonly finance: any) {}

  list(query: Record<string, string>, user?: RequestUser) {
    return this.finance.cashflowCore(query, user);
  }

  export(query: Record<string, string>, user?: RequestUser) {
    return this.finance.exportCashflowCore(query, user);
  }
}
