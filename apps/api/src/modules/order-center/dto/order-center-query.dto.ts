import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderCostStatus, OrderPaymentStatus, OrderStatus, OrderType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class OrderCenterQueryDto {
  [key: string]: string | number | boolean | undefined;

  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tourCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentTo?: string;

  @ApiPropertyOptional({ enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderPaymentStatus })
  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @ApiPropertyOptional({ enum: OrderCostStatus })
  @IsOptional()
  @IsEnum(OrderCostStatus)
  costStatus?: OrderCostStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sales?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  operatorOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commissionStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  compact?: string | boolean;

  @ApiPropertyOptional()
  @IsOptional()
  take?: string | number;
}
