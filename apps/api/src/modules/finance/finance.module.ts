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

@Module({
  imports: [DatabaseModule, FilesModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceReceiptService, FinancePaymentService, FinanceInvoiceService, FinanceLedgerService, FinanceCashflowService],
})
export class FinanceModule {}
