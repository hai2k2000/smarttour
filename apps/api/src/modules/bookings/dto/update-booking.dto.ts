import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

const normalizeBookingStatus = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

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

export class UpdateBookingDto extends UpdateBookingFieldsDto {}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @Transform(normalizeBookingStatus)
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
