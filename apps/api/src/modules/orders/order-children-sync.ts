import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';
import { operationAmount, salesAmount } from './order-calculator';

type ChildInput = { id?: string | null };
type ChildData = Record<string, unknown>;
type ChildDelegate = {
  create(args: { data: ChildData; select: { id: true } }): Promise<{ id: string }>;
  createMany(args: { data: ChildData[] }): Promise<unknown>;
  deleteMany(args: { where: ChildData }): Promise<unknown>;
  findMany(args: { where: ChildData; select: { id: true } }): Promise<Array<{ id: string }>>;
  update(args: { where: { id: string }; data: ChildData }): Promise<unknown>;
};

@Injectable()
export class OrderChildrenSyncService {
  create(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
    return createOrderChildren(tx, orderId, dto);
  }

  sync(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
    return syncOrderChildren(tx, orderId, dto);
  }

  replace(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
    return syncOrderChildren(tx, orderId, dto);
  }
}

export async function createOrderChildren(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
  if (dto.guides) await insertRows(tx.orderGuide as unknown as ChildDelegate, orderId, dto.guides, guideData);
  if (dto.salesItems) await insertRows(tx.orderSalesItem as unknown as ChildDelegate, orderId, dto.salesItems, salesItemData);
  if (dto.operationItems) await insertRows(tx.orderOperationItem as unknown as ChildDelegate, orderId, dto.operationItems, operationItemData);
  if (dto.members) await insertRows(tx.orderMember as unknown as ChildDelegate, orderId, dto.members, memberData);
  if (dto.itineraries) await insertRows(tx.orderItinerary as unknown as ChildDelegate, orderId, dto.itineraries, itineraryData);
  if (dto.handoverItems) await insertRows(tx.orderHandoverItem as unknown as ChildDelegate, orderId, dto.handoverItems, handoverItemData);
  if (dto.surveyQuestions) await insertRows(tx.orderSurveyQuestion as unknown as ChildDelegate, orderId, dto.surveyQuestions, surveyQuestionData);
  if (dto.terms) await insertRows(tx.orderTerm as unknown as ChildDelegate, orderId, dto.terms, termData);
}

export async function syncOrderChildren(tx: Prisma.TransactionClient, orderId: string, dto: Partial<CreateOrderDto>) {
  if (dto.guides) await syncRows(tx.orderGuide as unknown as ChildDelegate, orderId, dto.guides, guideData);
  if (dto.salesItems) await syncRows(tx.orderSalesItem as unknown as ChildDelegate, orderId, dto.salesItems, salesItemData);
  if (dto.operationItems) await syncRows(tx.orderOperationItem as unknown as ChildDelegate, orderId, dto.operationItems, operationItemData);
  if (dto.members) await syncRows(tx.orderMember as unknown as ChildDelegate, orderId, dto.members, memberData);
  if (dto.itineraries) await syncRows(tx.orderItinerary as unknown as ChildDelegate, orderId, dto.itineraries, itineraryData);
  if (dto.handoverItems) await syncRows(tx.orderHandoverItem as unknown as ChildDelegate, orderId, dto.handoverItems, handoverItemData);
  if (dto.surveyQuestions) await syncRows(tx.orderSurveyQuestion as unknown as ChildDelegate, orderId, dto.surveyQuestions, surveyQuestionData);
  if (dto.terms) await syncRows(tx.orderTerm as unknown as ChildDelegate, orderId, dto.terms, termData);
}

async function insertRows<T extends ChildInput>(delegate: ChildDelegate, orderId: string, items: T[], mapData: (item: T, index: number) => ChildData | null) {
  const data = items.map((item, index) => mapData(item, index)).filter(isChildData).map((item) => ({ orderId, ...item }));
  if (data.length) await delegate.createMany({ data });
}

async function syncRows<T extends ChildInput>(delegate: ChildDelegate, orderId: string, items: T[], mapData: (item: T, index: number) => ChildData | null) {
  const existing = await delegate.findMany({ where: { orderId }, select: { id: true } });
  const existingIds = new Set(existing.map((item) => item.id));
  const seenIds = new Set<string>();
  const keepIds: string[] = [];
  const mappedItems = items.map((item, index) => ({ item, data: mapData(item, index) }));
  if (items.length > 0 && !mappedItems.some((row) => row.data) && items.every((item) => !text(item.id))) return;

  for (const { item, data } of mappedItems) {
    if (!data) continue;
    const id = text(item.id);
    if (!id) {
      const created = await delegate.create({ data: { orderId, ...data }, select: { id: true } });
      keepIds.push(created.id);
      continue;
    }
    if (seenIds.has(id)) throw new BadRequestException('Duplicate order child row id');
    if (!existingIds.has(id)) throw new BadRequestException('Order child row does not belong to this order');
    seenIds.add(id);
    keepIds.push(id);
    await delegate.update({ where: { id }, data });
  }

  await delegate.deleteMany({ where: keepIds.length ? { orderId, id: { notIn: keepIds } } : { orderId } });
}

function guideData(item: { guideId?: string | null; guideName?: string | null; phone?: string | null; language?: string | null; note?: string | null }) {
  if (!text(item.guideName) && !text(item.guideId)) return null;
  return {
    guideId: text(item.guideId),
    guideName: text(item.guideName),
    phone: text(item.phone),
    language: text(item.language),
    note: text(item.note),
  };
}

function salesItemData(item: { serviceType?: string | null; supplierId?: string | null; serviceId?: string | null; description?: string | null; quantity?: number; serviceCount?: number; unitPrice?: number; vat?: number; note?: string | null }, index: number) {
  const amount = salesAmount(item);
  if (!text(item.serviceType) && !text(item.supplierId) && !text(item.serviceId) && !text(item.description) && !text(item.note) && amount === 0) return null;
  return {
    serviceType: text(item.serviceType),
    supplierId: text(item.supplierId),
    serviceId: text(item.serviceId),
    description: text(item.description),
    quantity: item.quantity ?? 1,
    serviceCount: item.serviceCount ?? 1,
    unitPrice: item.unitPrice ?? 0,
    vat: item.vat ?? 0,
    amount,
    note: text(item.note),
    sortOrder: index,
  };
}

function operationItemData(item: { serviceType?: string | null; supplierId?: string | null; serviceId?: string | null; bookingCode?: string | null; serviceDate?: string | Date | null; quantity?: number; netPrice?: number; vat?: number; status?: string; note?: string | null }, index: number) {
  const amount = operationAmount(item);
  if (!text(item.serviceType) && !text(item.supplierId) && !text(item.serviceId) && !text(item.bookingCode) && !text(item.note) && amount === 0) return null;
  return {
    serviceType: text(item.serviceType),
    supplierId: text(item.supplierId),
    serviceId: text(item.serviceId),
    bookingCode: text(item.bookingCode),
    serviceDate: date(item.serviceDate),
    quantity: item.quantity ?? 1,
    netPrice: item.netPrice ?? 0,
    vat: item.vat ?? 0,
    amount,
    status: item.status ?? 'WAITING',
    note: text(item.note),
    sortOrder: index,
  };
}

function memberData(item: { fullName?: string | null; gender?: string | null; birthday?: string | Date | null; phone?: string | null; email?: string | null; identityNumber?: string | null; issuedDate?: string | Date | null; nationality?: string | null; passengerType?: string | null; note?: string | null }, index: number) {
  const fullName = text(item.fullName);
  if (!fullName) return null;
  return {
    fullName,
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
  };
}

function itineraryData(item: { dayNo?: number; title?: string | null; content?: string | null; period?: string | null; destination?: string | null; meals?: string | null; hotel?: string | null; restaurant?: string | null; services?: string | null; note?: string | null }, index: number) {
  if (!text(item.title) && !text(item.content)) return null;
  return {
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
  };
}

function handoverItemData(item: { itemName?: string | null; quantity?: number; note?: string | null }, index: number) {
  const itemName = text(item.itemName);
  if (!itemName) return null;
  return { itemName, quantity: item.quantity ?? 1, note: text(item.note), sortOrder: index };
}

function surveyQuestionData(item: { question?: string | null; note?: string | null }, index: number) {
  const question = text(item.question);
  if (!question) return null;
  return { question, note: text(item.note), sortOrder: index };
}

function termData(item: { language?: string | null; terms?: string | null; notes?: string | null }) {
  return { language: item.language || 'VN', terms: text(item.terms), notes: text(item.notes) };
}

function isChildData(value: ChildData | null): value is ChildData {
  return value !== null;
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function date(value?: string | Date | null) {
  return value ? new Date(value) : null;
}
