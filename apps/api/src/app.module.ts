import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CommissionReportsModule } from './modules/commission-reports/commission-reports.module';
import { CustomersModule } from './modules/customers/customers.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FitToursModule } from './modules/fit-tours/fit-tours.module';
import { FilesModule } from './modules/files/files.module';
import { GitToursModule } from './modules/git-tours/git-tours.module';
import { LandToursModule } from './modules/landtours/landtours.module';
import { OperationsModule } from './modules/operations/operations.module';
import { OperationVouchersModule } from './modules/operation-vouchers/operation-vouchers.module';
import { OrderCenterModule } from './modules/order-center/order-center.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { TourProgramsModule } from './modules/tour-programs/tour-programs.module';
import { TourGuidesModule } from './modules/tour-guides/tour-guides.module';
import { ToursModule } from './modules/tours/tours.module';

@Module({
  imports: [DatabaseModule, AuthModule, FilesModule, OperationsModule, OperationVouchersModule, OrderCenterModule, CommissionReportsModule, FinanceModule, SuppliersModule, TourProgramsModule, TourGuidesModule, CustomersModule, BookingsModule, ToursModule, FitToursModule, GitToursModule, LandToursModule, QuotesModule, QuotationsModule, OrdersModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
