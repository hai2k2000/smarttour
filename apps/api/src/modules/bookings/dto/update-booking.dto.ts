import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

class UpdateBookingFieldsDto extends PartialType(
  PickType(CreateBookingDto, [
    'code',
    'tourProgramId',
    'customerId',
    'orderId',
    'tourId',
    'customerName',
    'customerPhone',
    'customerEmail',
    'paxCount',
    'startDate',
    'endDate',
    'saleOwner',
    'operatorOwner',
    'totalSellPrice',
  ] as const),
) {}

export class UpdateBookingDto extends UpdateBookingFieldsDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
