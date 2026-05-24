import { Injectable } from '@nestjs/common';

@Injectable()
export class OperationsService {
  getDashboard() {
    return {
      upcomingDepartures: 0,
      operatingTours: 0,
      overdueTasks: 0,
      waitingSupplierConfirmations: 0,
      pendingSupplierPayments: 0,
      lowMarginTours: 0,
    };
  }

  getModules() {
    return [
      'suppliers',
      'tour-programs',
      'bookings',
      'operation-forms',
      'operation-services',
      'operation-costs',
      'supplier-payment-requests',
      'profit-loss-reports',
    ];
  }
}
