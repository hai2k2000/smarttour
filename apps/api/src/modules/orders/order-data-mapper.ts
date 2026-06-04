import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { CreateOrderDto } from './dto/order.dto';

export type ScopedOrderDto = CreateOrderDto & { department?: string | null };

type OrderLineSource = Record<string, any>;
type OrderTotalsSource = {
  paidAmount?: unknown;
  paidCost?: unknown;
  salesItems: OrderLineSource[];
  operationItems: OrderLineSource[];
};

export function toOrderData(dto: Partial<ScopedOrderDto>) {
  return {
    ...(dto.systemCode !== undefined ? { systemCode: dto.systemCode.trim() } : {}),
    ...(dto.tourCode !== undefined ? { tourCode: text(dto.tourCode) } : {}),
    ...(dto.holdCode !== undefined ? { holdCode: text(dto.holdCode) } : {}),
    ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
    ...(dto.route !== undefined ? { route: text(dto.route) } : {}),
    ...(dto.marketGroup !== undefined ? { marketGroup: text(dto.marketGroup) } : {}),
    ...(dto.bookingDate !== undefined ? { bookingDate: date(dto.bookingDate, 'bookingDate') } : {}),
    ...(dto.paymentDate !== undefined ? { paymentDate: date(dto.paymentDate, 'paymentDate') } : {}),
    ...(dto.startDate !== undefined ? { startDate: date(dto.startDate, 'startDate') } : {}),
    ...(dto.endDate !== undefined ? { endDate: date(dto.endDate, 'endDate') } : {}),
    ...(dto.status !== undefined ? { status: dto.status } : {}),
    ...(dto.costStatus !== undefined ? { costStatus: dto.costStatus } : {}),
    ...(dto.tourCategory !== undefined ? { tourCategory: text(dto.tourCategory) } : {}),
    ...(dto.currency !== undefined ? { currency: dto.currency || 'VND' } : {}),
    ...(dto.exchangeRate !== undefined ? { exchangeRate: dto.exchangeRate || 1 } : {}),
    ...(dto.createdBy !== undefined ? { createdBy: text(dto.createdBy) } : {}),
    ...(dto.createdDate !== undefined ? { createdDate: date(dto.createdDate, 'createdDate') } : {}),
    ...(dto.branch !== undefined ? { branch: text(dto.branch) } : {}),
    ...(dto.department !== undefined ? { department: text(dto.department) } : {}),
    ...(dto.customerId !== undefined ? { customerId: text(dto.customerId) } : {}),
    ...(dto.customerName !== undefined ? { customerName: text(dto.customerName) } : {}),
    ...(dto.customerType !== undefined ? { customerType: text(dto.customerType) } : {}),
    ...(dto.customerPhone !== undefined ? { customerPhone: text(dto.customerPhone) } : {}),
    ...(dto.customerEmail !== undefined ? { customerEmail: text(dto.customerEmail) } : {}),
    ...(dto.customerAddress !== undefined ? { customerAddress: text(dto.customerAddress) } : {}),
    ...(dto.agencyName !== undefined ? { agencyName: text(dto.agencyName) } : {}),
    ...(dto.collaborator !== undefined ? { collaborator: text(dto.collaborator) } : {}),
    ...(dto.operatorOwner !== undefined ? { operatorOwner: text(dto.operatorOwner) } : {}),
    ...(dto.adultQty !== undefined ? { adultQty: dto.adultQty } : {}),
    ...(dto.childQty !== undefined ? { childQty: dto.childQty } : {}),
    ...(dto.infantQty !== undefined ? { infantQty: dto.infantQty } : {}),
    ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
    ...(dto.roomClass !== undefined ? { roomClass: text(dto.roomClass) } : {}),
    ...(dto.servicePackage !== undefined ? { servicePackage: text(dto.servicePackage) } : {}),
    ...(dto.transportType !== undefined ? { transportType: text(dto.transportType) } : {}),
    ...(dto.pickupPoint !== undefined ? { pickupPoint: text(dto.pickupPoint) } : {}),
    ...(dto.dropoffPoint !== undefined ? { dropoffPoint: text(dto.dropoffPoint) } : {}),
    ...(dto.seatTotal !== undefined ? { seatTotal: dto.seatTotal } : {}),
    ...(dto.seatHeld !== undefined ? { seatHeld: dto.seatHeld } : {}),
    ...(dto.seatSold !== undefined ? { seatSold: dto.seatSold } : {}),
    ...(dto.allowOverbooking !== undefined ? { allowOverbooking: dto.allowOverbooking } : {}),
    ...(dto.receiveDeadline !== undefined ? { receiveDeadline: date(dto.receiveDeadline, 'receiveDeadline') } : {}),
    ...(dto.closeDeadline !== undefined ? { closeDeadline: date(dto.closeDeadline, 'closeDeadline') } : {}),
    ...(dto.commission !== undefined ? { commission: dto.commission } : {}),
    ...(dto.note !== undefined ? { note: text(dto.note) } : {}),
    ...(dto.handoverRequest !== undefined ? { handoverRequest: text(dto.handoverRequest) } : {}),
    ...(dto.surveyDescription !== undefined ? { surveyDescription: text(dto.surveyDescription) } : {}),
  };
}

export function mergeOrderTotalsInput(current: OrderTotalsSource, dto: Partial<CreateOrderDto>): Partial<CreateOrderDto> {
  return {
    paidAmount: dto.paidAmount ?? number(current.paidAmount),
    paidCost: dto.paidCost ?? number(current.paidCost),
    salesItems: dto.salesItems ?? current.salesItems.map(toSalesItemDto),
    operationItems: dto.operationItems ?? current.operationItems.map(toOperationItemDto),
  };
}

export function mergeOrderDateInput(
  current: {
    bookingDate?: Date | string | null;
    paymentDate?: Date | string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    createdDate?: Date | string | null;
    receiveDeadline?: Date | string | null;
    closeDeadline?: Date | string | null;
  },
  dto: Partial<CreateOrderDto>,
): Partial<CreateOrderDto> {
  return {
    ...dto,
    bookingDate: dto.bookingDate ?? iso(current.bookingDate),
    paymentDate: dto.paymentDate ?? iso(current.paymentDate),
    startDate: dto.startDate ?? iso(current.startDate),
    endDate: dto.endDate ?? iso(current.endDate),
    createdDate: dto.createdDate ?? iso(current.createdDate),
    receiveDeadline: dto.receiveDeadline ?? iso(current.receiveDeadline),
    closeDeadline: dto.closeDeadline ?? iso(current.closeDeadline),
  };
}

export function toOrderCopyDto(order: Record<string, any>): ScopedOrderDto {
  return {
    systemCode: `${order.systemCode}-COPY-${Date.now().toString().slice(-4)}`,
    tourCode: order.tourCode ?? undefined,
    name: `${order.name} Copy`,
    route: order.route ?? undefined,
    marketGroup: order.marketGroup ?? undefined,
    bookingDate: iso(order.bookingDate),
    startDate: iso(order.startDate),
    endDate: iso(order.endDate),
    status: 'UPCOMING',
    tourCategory: order.tourCategory ?? undefined,
    currency: order.currency,
    exchangeRate: number(order.exchangeRate),
    createdDate: new Date().toISOString(),
    branch: order.branch ?? undefined,
    department: order.department ?? undefined,
    customerId: order.customerId ?? undefined,
    customerName: order.customerName ?? undefined,
    customerType: order.customerType ?? undefined,
    customerPhone: order.customerPhone ?? undefined,
    customerEmail: order.customerEmail ?? undefined,
    customerAddress: order.customerAddress ?? undefined,
    agencyName: order.agencyName ?? undefined,
    collaborator: order.collaborator ?? undefined,
    operatorOwner: order.operatorOwner ?? undefined,
    adultQty: order.adultQty,
    childQty: order.childQty,
    infantQty: order.infantQty,
    quantity: order.quantity,
    roomClass: order.roomClass ?? undefined,
    servicePackage: order.servicePackage ?? undefined,
    transportType: order.transportType ?? undefined,
    pickupPoint: order.pickupPoint ?? undefined,
    dropoffPoint: order.dropoffPoint ?? undefined,
    seatTotal: order.seatTotal,
    seatHeld: order.seatHeld,
    seatSold: order.seatSold,
    allowOverbooking: order.allowOverbooking,
    receiveDeadline: iso(order.receiveDeadline),
    closeDeadline: iso(order.closeDeadline),
    paidAmount: 0,
    paidCost: 0,
    commission: number(order.commission),
    note: order.note ?? undefined,
    handoverRequest: order.handoverRequest ?? undefined,
    surveyDescription: order.surveyDescription ?? undefined,
    salesItems: order.salesItems?.map(toSalesItemDto),
    operationItems: order.operationItems?.map(toOperationItemDto),
    guides: order.guides?.map((item: OrderLineSource) => ({
      guideId: item.guideId ?? undefined,
      guideName: item.guideName ?? undefined,
      phone: item.phone ?? undefined,
      language: item.language ?? undefined,
      note: item.note ?? undefined,
    })),
    members: order.members?.map((item: OrderLineSource) => ({
      fullName: item.fullName,
      gender: item.gender ?? undefined,
      birthday: iso(item.birthday, 'member.birthday'),
      phone: item.phone ?? undefined,
      email: item.email ?? undefined,
      identityNumber: item.identityNumber ?? undefined,
      issuedDate: iso(item.issuedDate, 'member.issuedDate'),
      nationality: item.nationality ?? undefined,
      passengerType: item.passengerType ?? undefined,
      note: item.note ?? undefined,
    })),
    itineraries: order.itineraries?.map((item: OrderLineSource) => ({
      dayNo: item.dayNo,
      title: item.title ?? undefined,
      content: item.content ?? undefined,
      period: item.period ?? undefined,
      destination: item.destination ?? undefined,
      meals: item.meals ?? undefined,
      hotel: item.hotel ?? undefined,
      restaurant: item.restaurant ?? undefined,
      services: item.services ?? undefined,
      note: item.note ?? undefined,
    })),
    handoverItems: order.handoverItems?.map((item: OrderLineSource) => ({ itemName: item.itemName, quantity: item.quantity, note: item.note ?? undefined })),
    surveyQuestions: order.surveyQuestions?.map((item: OrderLineSource) => ({ question: item.question, note: item.note ?? undefined })),
    terms: order.terms?.map((item: OrderLineSource) => ({ language: item.language, terms: item.terms ?? undefined, notes: item.notes ?? undefined })),
  };
}

export function validateOrderDates(dto: Partial<CreateOrderDto>) {
  const parsed = new Map<string, Date | null>();
  for (const [field, value] of [
    ['bookingDate', dto.bookingDate],
    ['paymentDate', dto.paymentDate],
    ['startDate', dto.startDate],
    ['endDate', dto.endDate],
    ['createdDate', dto.createdDate],
    ['receiveDeadline', dto.receiveDeadline],
    ['closeDeadline', dto.closeDeadline],
  ] as const) {
    parsed.set(field, parseOrderDate(value, field));
  }
  validateNestedDates(dto);
  const startDate = parsed.get('startDate');
  const endDate = parsed.get('endDate');
  const bookingDate = parsed.get('bookingDate');
  const paymentDate = parsed.get('paymentDate');
  if (startDate && endDate && endDate < startDate) throw new BadRequestException('End date must be after start date');
  if (bookingDate && paymentDate && paymentDate < bookingDate) throw new BadRequestException('Payment date must be after booking date');
}

export function orderStatusForAllotment(currentStatus: OrderStatus, dto: Partial<CreateOrderDto>) {
  return (dto.status ?? currentStatus) as OrderStatus;
}

export function shouldResyncHotelAllotments(dto: Partial<CreateOrderDto>) {
  return dto.operationItems !== undefined || dto.startDate !== undefined || dto.status !== undefined;
}

function toSalesItemDto(item: OrderLineSource) {
  return {
    id: item.id,
    serviceType: item.serviceType ?? undefined,
    supplierId: item.supplierId ?? undefined,
    serviceId: item.serviceId ?? undefined,
    description: item.description ?? undefined,
    quantity: number(item.quantity),
    serviceCount: number(item.serviceCount),
    unitPrice: number(item.unitPrice),
    vat: number(item.vat),
    note: item.note ?? undefined,
  };
}

function toOperationItemDto(item: OrderLineSource) {
  return {
    id: item.id,
    serviceType: item.serviceType ?? undefined,
    supplierId: item.supplierId ?? undefined,
    serviceId: item.serviceId ?? undefined,
    bookingCode: item.bookingCode ?? undefined,
    serviceDate: iso(item.serviceDate, 'operationItems.serviceDate'),
    quantity: number(item.quantity),
    netPrice: number(item.netPrice),
    vat: number(item.vat),
    status: item.status,
    note: item.note ?? undefined,
  };
}

function text(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateNestedDates(dto: Partial<CreateOrderDto>) {
  dto.operationItems?.forEach((item, index) => parseOrderDate(item.serviceDate, `operationItems[${index}].serviceDate`));
  dto.members?.forEach((item, index) => {
    parseOrderDate(item.birthday, `members[${index}].birthday`);
    parseOrderDate(item.issuedDate, `members[${index}].issuedDate`);
  });
}

function date(value?: string | Date | null, field = 'date') {
  return parseOrderDate(value, field);
}

function iso(value?: Date | string | null, field = 'date') {
  return parseOrderDate(value, field)?.toISOString();
}

function number(value: unknown) {
  return Number(value ?? 0);
}

function parseOrderDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(`${field} is invalid`);
  return parsed;
}
