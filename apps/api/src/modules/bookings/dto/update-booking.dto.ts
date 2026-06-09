import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { BOOKING_CREATE_FIELDS, CreateBookingDto } from './create-booking.dto';

const normalizeBookingStatus = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export const BOOKING_UPDATE_FIELDS = BOOKING_CREATE_FIELDS;

class UpdateBookingFieldsDto extends PartialType(PickType(CreateBookingDto, BOOKING_UPDATE_FIELDS)) {}

export class UpdateBookingDto extends UpdateBookingFieldsDto {}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @Transform(normalizeBookingStatus)
  @IsEnum(BookingStatus)
  status!: BookingStatus;
}
