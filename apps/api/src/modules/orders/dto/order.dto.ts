import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OrderCostStatus, OrderServiceStatus, OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const ID_MAX = 80;
const CODE_MAX = 80;
const NAME_MAX = 220;
const SHORT_TEXT_MAX = 120;
const MEDIUM_TEXT_MAX = 500;
const LONG_TEXT_MAX = 5000;
const PHONE_MAX = 40;
const EMAIL_MAX = 160;

class OrderGuideDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) guideId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) guideName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(PHONE_MAX) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderSalesItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) serviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) serviceCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vat?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderOperationItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) serviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) bookingCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() serviceDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vat?: number;
  @ApiPropertyOptional({ enum: OrderServiceStatus }) @IsOptional() @IsEnum(OrderServiceStatus) status?: OrderServiceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(NAME_MAX) fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() birthday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(PHONE_MAX) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(EMAIL_MAX) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) identityNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issuedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) passengerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderItineraryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) dayNo!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LONG_TEXT_MAX) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) destination?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) meals?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) hotel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) restaurant?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) services?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderHandoverItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(NAME_MAX) itemName!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderSurveyQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(MEDIUM_TEXT_MAX) question!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) note?: string;
}

class OrderTermDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LONG_TEXT_MAX) terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) notes?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(CODE_MAX) systemCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) tourCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) holdCode?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(NAME_MAX) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) route?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) marketGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() bookingDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional({ enum: OrderCostStatus }) @IsOptional() @IsEnum(OrderCostStatus) costStatus?: OrderCostStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) tourCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12) currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() exchangeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) createdBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() createdDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) customerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(PHONE_MAX) customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(EMAIL_MAX) customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) customerAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) agencyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) collaborator?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(NAME_MAX) operatorOwner?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) adultQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) childQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) infantQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) roomClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) servicePackage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT_TEXT_MAX) transportType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) pickupPoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MEDIUM_TEXT_MAX) dropoffPoint?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) seatTotal?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) seatHeld?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) seatSold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowOverbooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() receiveDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() closeDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidCost?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() commission?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LONG_TEXT_MAX) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LONG_TEXT_MAX) handoverRequest?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LONG_TEXT_MAX) surveyDescription?: string;
  @ApiPropertyOptional({ type: [OrderGuideDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderGuideDto) guides?: OrderGuideDto[];
  @ApiPropertyOptional({ type: [OrderSalesItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderSalesItemDto) salesItems?: OrderSalesItemDto[];
  @ApiPropertyOptional({ type: [OrderOperationItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderOperationItemDto) operationItems?: OrderOperationItemDto[];
  @ApiPropertyOptional({ type: [OrderMemberDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderMemberDto) members?: OrderMemberDto[];
  @ApiPropertyOptional({ type: [OrderItineraryDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItineraryDto) itineraries?: OrderItineraryDto[];
  @ApiPropertyOptional({ type: [OrderHandoverItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderHandoverItemDto) handoverItems?: OrderHandoverItemDto[];
  @ApiPropertyOptional({ type: [OrderSurveyQuestionDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderSurveyQuestionDto) surveyQuestions?: OrderSurveyQuestionDto[];
  @ApiPropertyOptional({ type: [OrderTermDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OrderTermDto) terms?: OrderTermDto[];
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status!: OrderStatus;
}

export class UnlockOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() actor?: string;
  @ApiProperty() @IsString() @MinLength(2) reason!: string;
}
