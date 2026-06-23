import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, OrderType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTo?: string;

  @ApiPropertyOptional({ enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costStatus?: string;

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
