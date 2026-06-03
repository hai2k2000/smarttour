import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { FilesModule } from '../files/files.module';
import { FinanceCashflowService } from './finance-cashflow.service';
import { FinanceController } from './finance.controller';
import { FinanceInvoiceService } from './finance-invoice.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinancePaymentService } from './finance-payment.service';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceService } from './finance.service';

const financeDomainProviders = [
  { provide: FinanceReceiptService, useFactory: (finance: FinanceService) => new FinanceReceiptService(finance), inject: [FinanceService] },
  { provide: FinancePaymentService, useFactory: (finance: FinanceService) => new FinancePaymentService(finance), inject: [FinanceService] },
  { provide: FinanceInvoiceService, useFactory: (finance: FinanceService) => new FinanceInvoiceService(finance), inject: [FinanceService] },
  { provide: FinanceLedgerService, useFactory: (finance: FinanceService) => new FinanceLedgerService(finance), inject: [FinanceService] },
  { provide: FinanceCashflowService, useFactory: (finance: FinanceService) => new FinanceCashflowService(finance), inject: [FinanceService] },
];

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [FinanceController],
  providers: [FinanceService, ...financeDomainProviders],
})
export class FinanceModule {}
