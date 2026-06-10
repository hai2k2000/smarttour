import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const TOUR_ITINERARY_TITLE_MAX_LENGTH = 250;
export const TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH = 2000;

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateItineraryDayDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Số thứ tự ngày trong lịch trình tour mẫu.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Số thứ tự ngày hành trình phải là số nguyên hợp lệ' })
  @Min(1, { message: 'Số thứ tự ngày hành trình phải lớn hơn hoặc bằng 1' })
  dayNumber!: number;

  @ApiProperty({
    example: 'Hà Nội - Hạ Long',
    minLength: 2,
    maxLength: TOUR_ITINERARY_TITLE_MAX_LENGTH,
    description: 'Tiêu đề ngắn của ngày lịch trình, hiển thị trên tour mẫu.',
  })
  @Transform(trimString)
  @IsString({ message: 'Tiêu đề ngày hành trình phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tiêu đề ngày hành trình phải có ít nhất 2 ký tự' })
  @MaxLength(TOUR_ITINERARY_TITLE_MAX_LENGTH, { message: `Tiêu đề ngày hành trình không được vượt quá ${TOUR_ITINERARY_TITLE_MAX_LENGTH} ký tự` })
  title!: string;

  @ApiPropertyOptional({
    example: 'Khởi hành từ Hà Nội, tham quan vịnh Hạ Long.',
    maxLength: TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH,
    description: 'Mô tả nội dung trong ngày lịch trình, cho phép xuống dòng.',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả ngày hành trình phải là chuỗi ký tự' })
  @MaxLength(TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH, { message: `Mô tả ngày hành trình không được vượt quá ${TOUR_ITINERARY_DESCRIPTION_MAX_LENGTH} ký tự` })
  description?: string;
}
