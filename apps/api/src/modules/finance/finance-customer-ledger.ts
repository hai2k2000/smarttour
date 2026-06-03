import { Prisma } from '@prisma/client';

type ReceiptForCustomerLedger = {
  id: string;
  receiptAmount: Prisma.Decimal;
  receiptCode: string;
  receiptName: string | null;
  paymentDate: Date | null;
  reason: string | null;
  branch: string | null;
  department: string | null;
  assignedStaff: string | null;
  orders: { orderId: string | null }[];
};

type InvoiceForCustomerLedger = {
  id: string;
  orderId: string | null;
  invoiceNumber: string | null;
  invoiceCode: string;
  issuedDate: Date | null;
  invoiceDate: Date | null;
  totalAfterTax: Prisma.Decimal;
  note: string | null;
  companyName: string | null;
  customerName: string | null;
};

export async function upsertReceiptCustomerLedger(
  tx: Prisma.TransactionClient,
  receipt: ReceiptForCustomerLedger,
  customerId: string | null,
  actor: string,
) {
  if (!customerId) return;

  await tx.customerLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
    create: {
      customerId,
      receiptId: receipt.id,
      orderId: receipt.orders.find((line) => line.orderId)?.orderId,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: receipt.id,
      entryType: 'CREDIT',
      creditAmount: receipt.receiptAmount,
      documentCode: receipt.receiptCode,
      documentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      description: receipt.reason || receipt.receiptName,
      createdBy: actor,
    },
    update: {
      customerId,
      creditAmount: receipt.receiptAmount,
      documentCode: receipt.receiptCode,
      documentDate: receipt.paymentDate || new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: receipt.assignedStaff,
      description: receipt.reason || receipt.receiptName,
    },
  });
}

export async function createReceiptReversalCustomerLedger(
  tx: Prisma.TransactionClient,
  receipt: ReceiptForCustomerLedger,
  reversalId: string,
  customerId: string | null,
  reversalCode: string,
  reason: string,
  actor: string,
) {
  if (!customerId) return;

  const original = await tx.customerLedgerEntry.findUnique({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_RECEIPT', sourceId: receipt.id, entryType: 'CREDIT' } },
  });
  await tx.customerLedgerEntry.create({
    data: {
      customerId,
      receiptId: reversalId,
      orderId: receipt.orders.find((line) => line.orderId)?.orderId,
      sourceType: 'FINANCE_RECEIPT',
      sourceId: reversalId,
      entryType: 'REVERSAL',
      debitAmount: receipt.receiptAmount,
      documentCode: reversalCode,
      documentDate: new Date(),
      branch: receipt.branch,
      department: receipt.department,
      staff: actor,
      description: reason,
      reversedEntryId: original?.id,
      createdBy: actor,
    },
  });
}

export async function upsertInvoiceCustomerLedger(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForCustomerLedger,
  customerId: string | null,
  actor: string,
) {
  if (!customerId) return;

  await tx.customerLedgerEntry.upsert({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } },
    create: {
      customerId,
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      sourceType: 'FINANCE_INVOICE',
      sourceId: invoice.id,
      entryType: 'DEBIT',
      debitAmount: invoice.totalAfterTax,
      documentCode: invoice.invoiceNumber || invoice.invoiceCode,
      documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
      description: invoice.note || invoice.companyName || invoice.customerName,
      createdBy: actor,
    },
    update: {
      customerId,
      debitAmount: invoice.totalAfterTax,
      documentCode: invoice.invoiceNumber || invoice.invoiceCode,
      documentDate: invoice.issuedDate || invoice.invoiceDate || new Date(),
      description: invoice.note || invoice.companyName || invoice.customerName,
    },
  });
}

export async function createInvoiceReversalCustomerLedger(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForCustomerLedger,
  reversalId: string,
  customerId: string | null,
  reversalCode: string,
  reason: string,
  actor: string,
) {
  if (!customerId) return;

  const original = await tx.customerLedgerEntry.findUnique({
    where: { sourceType_sourceId_entryType: { sourceType: 'FINANCE_INVOICE', sourceId: invoice.id, entryType: 'DEBIT' } },
  });
  await tx.customerLedgerEntry.create({
    data: {
      customerId,
      invoiceId: reversalId,
      orderId: invoice.orderId,
      sourceType: 'FINANCE_INVOICE',
      sourceId: reversalId,
      entryType: 'REVERSAL',
      creditAmount: invoice.totalAfterTax,
      documentCode: reversalCode,
      documentDate: new Date(),
      description: reason,
      reversedEntryId: original?.id,
      createdBy: actor,
    },
  });
}
