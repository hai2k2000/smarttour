import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';
import { operationAmount, salesAmount } from './order-calculator';

@Injectable()
export class OrderChildrenSyncService {
  replace(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
    return replaceOrderChildren(tx, orderId, dto);
  }
}

export async function replaceOrderChildren(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
  if (dto.guides) {
    await tx.orderGuide.deleteMany({ where: { orderId } });
    await tx.orderGuide.createMany({
      data: dto.guides
        .filter((item) => item.guideName || item.guideId)
        .map((item) => ({
          orderId,
          guideId: text(item.guideId),
          guideName: text(item.guideName),
          phone: text(item.phone),
          language: text(item.language),
          note: text(item.note),
        })),
    });
  }
  if (dto.salesItems) {
    await tx.orderSalesItem.deleteMany({ where: { orderId } });
    await tx.orderSalesItem.createMany({
      data: dto.salesItems.map((item, index) => ({
        orderId,
        serviceType: text(item.serviceType),
        supplierId: text(item.supplierId),
        serviceId: text(item.serviceId),
        description: text(item.description),
        quantity: item.quantity ?? 1,
        serviceCount: item.serviceCount ?? 1,
        unitPrice: item.unitPrice ?? 0,
        vat: item.vat ?? 0,
        amount: salesAmount(item),
        note: text(item.note),
        sortOrder: index,
      })),
    });
  }
  if (dto.operationItems) {
    await tx.orderOperationItem.deleteMany({ where: { orderId } });
    await tx.orderOperationItem.createMany({
      data: dto.operationItems.map((item, index) => ({
        orderId,
        serviceType: text(item.serviceType),
        supplierId: text(item.supplierId),
        serviceId: text(item.serviceId),
        bookingCode: text(item.bookingCode),
        serviceDate: date(item.serviceDate),
        quantity: item.quantity ?? 1,
        netPrice: item.netPrice ?? 0,
        vat: item.vat ?? 0,
        amount: operationAmount(item),
        status: item.status ?? 'WAITING',
        note: text(item.note),
        sortOrder: index,
      })),
    });
  }
  if (dto.members) {
    await tx.orderMember.deleteMany({ where: { orderId } });
    await tx.orderMember.createMany({
      data: dto.members
        .filter((item) => item.fullName?.trim())
        .map((item, index) => ({
          orderId,
          fullName: item.fullName.trim(),
          gender: text(item.gender),
          birthday: date(item.birthday),
          phone: text(item.phone),
          email: text(item.email),
          identityNumber: text(item.identityNumber),
          issuedDate: date(item.issuedDate),
          nationality: text(item.nationality),
          passengerType: text(item.passengerType),
          note: text(item.note),
          sortOrder: index,
        })),
    });
  }
  if (dto.itineraries) {
    await tx.orderItinerary.deleteMany({ where: { orderId } });
    await tx.orderItinerary.createMany({
      data: dto.itineraries
        .filter((item) => item.title || item.content)
        .map((item, index) => ({
          orderId,
          dayNo: item.dayNo,
          title: text(item.title),
          content: text(item.content),
          period: text(item.period),
          destination: text(item.destination),
          meals: text(item.meals),
          hotel: text(item.hotel),
          restaurant: text(item.restaurant),
          services: text(item.services),
          note: text(item.note),
          sortOrder: index,
        })),
    });
  }
  if (dto.handoverItems) {
    await tx.orderHandoverItem.deleteMany({ where: { orderId } });
    await tx.orderHandoverItem.createMany({
      data: dto.handoverItems
        .filter((item) => item.itemName?.trim())
        .map((item, index) => ({ orderId, itemName: item.itemName.trim(), quantity: item.quantity ?? 1, note: text(item.note), sortOrder: index })),
    });
  }
  if (dto.surveyQuestions) {
    await tx.orderSurveyQuestion.deleteMany({ where: { orderId } });
    await tx.orderSurveyQuestion.createMany({
      data: dto.surveyQuestions
        .filter((item) => item.question?.trim())
        .map((item, index) => ({ orderId, question: item.question.trim(), note: text(item.note), sortOrder: index })),
    });
  }
  if (dto.terms) {
    await tx.orderTerm.deleteMany({ where: { orderId } });
    await tx.orderTerm.createMany({ data: dto.terms.map((item) => ({ orderId, language: item.language || 'VN', terms: text(item.terms), notes: text(item.notes) })) });
  }
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function date(value?: string | null) {
  return value ? new Date(value) : null;
}
