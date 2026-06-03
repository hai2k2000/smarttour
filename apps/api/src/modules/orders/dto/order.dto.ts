import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OrderCostStatus, OrderServiceStatus, OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

class OrderGuideDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guideId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guideName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderSalesItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) serviceCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vat?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderOperationItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bookingCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceDate?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vat?: number;
  @ApiPropertyOptional({ enum: OrderServiceStatus }) @IsOptional() @IsEnum(OrderServiceStatus) status?: OrderServiceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderMemberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @MinLength(2) fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() identityNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() passengerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderItineraryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(1) dayNo!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() destination?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meals?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hotel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() restaurant?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() services?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderHandoverItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @MinLength(2) itemName!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderSurveyQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @MinLength(2) question!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class OrderTermDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() @MinLength(2) systemCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tourCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() holdCode?: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() route?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() marketGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bookingDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional({ enum: OrderCostStatus }) @IsOptional() @IsEnum(OrderCostStatus) costStatus?: OrderCostStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() tourCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() exchangeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agencyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() collaborator?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() operatorOwner?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) adultQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) infantQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() roomClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() servicePackage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transportType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pickupPoint?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dropoffPoint?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) seatTotal?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) seatHeld?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) seatSold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowOverbooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() receiveDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() closeDeadline?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) paidCost?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() commission?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() handoverRequest?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() surveyDescription?: string;
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
