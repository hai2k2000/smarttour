import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const TOUR_PROGRAM_CODE_MAX_LENGTH = 50;
export const TOUR_PROGRAM_NAME_MAX_LENGTH = 250;
export const TOUR_PROGRAM_ROUTE_MAX_LENGTH = 250;
export const TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH = 2000;
export const TOUR_PROGRAM_DURATION_DAYS_MAX = 60;

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimUppercaseString = ({ value }: { value: unknown }) => (
  typeof value === 'string' ? value.trim().toUpperCase() : value
);

export class CreateTourProgramDto {
  @ApiProperty({
    example: 'HL-3N2D',
    minLength: 2,
    maxLength: TOUR_PROGRAM_CODE_MAX_LENGTH,
    description: 'Mã tour mẫu, duy nhất trong hệ thống. API tự trim và chuẩn hóa chữ hoa trước khi lưu.',
  })
  @Transform(trimUppercaseString)
  @IsString({ message: 'Mã chương trình tour phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã chương trình tour phải có ít nhất 2 ký tự' })
  @MaxLength(TOUR_PROGRAM_CODE_MAX_LENGTH, { message: `Mã chương trình tour không được vượt quá ${TOUR_PROGRAM_CODE_MAX_LENGTH} ký tự` })
  code!: string;

  @ApiProperty({
    example: 'Hạ Long 3 ngày 2 đêm',
    minLength: 2,
    maxLength: TOUR_PROGRAM_NAME_MAX_LENGTH,
    description: 'Tên tour mẫu hiển thị cho booking, báo giá và vận hành; nên nhập đầy đủ dấu tiếng Việt.',
  })
  @Transform(trimString)
  @IsString({ message: 'Tên chương trình tour phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên chương trình tour phải có ít nhất 2 ký tự' })
  @MaxLength(TOUR_PROGRAM_NAME_MAX_LENGTH, { message: `Tên chương trình tour không được vượt quá ${TOUR_PROGRAM_NAME_MAX_LENGTH} ký tự` })
  name!: string;

  @ApiPropertyOptional({
    example: 'Hà Nội - Hạ Long - Ninh Bình',
    maxLength: TOUR_PROGRAM_ROUTE_MAX_LENGTH,
    description: 'Tuyến điểm tóm tắt theo thứ tự hành trình, dùng để tìm kiếm và hiển thị danh sách tour mẫu.',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Tuyến điểm phải là chuỗi ký tự' })
  @MaxLength(TOUR_PROGRAM_ROUTE_MAX_LENGTH, { message: `Tuyến điểm không được vượt quá ${TOUR_PROGRAM_ROUTE_MAX_LENGTH} ký tự` })
  route?: string;

  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: TOUR_PROGRAM_DURATION_DAYS_MAX,
    description: 'Tổng số ngày của tour mẫu; các ngày lịch trình không được vượt quá giá trị này.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày phải là số nguyên hợp lệ' })
  @Min(1, { message: 'Số ngày phải lớn hơn hoặc bằng 1' })
  @Max(TOUR_PROGRAM_DURATION_DAYS_MAX, { message: `Số ngày không được vượt quá ${TOUR_PROGRAM_DURATION_DAYS_MAX}` })
  durationDays!: number;

  @ApiPropertyOptional({
    example: 'Lịch trình mẫu cho tour Hạ Long 3 ngày 2 đêm.\nCho phép mô tả nhiều dòng.',
    maxLength: TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH,
    description: 'Mô tả tổng quan tour mẫu để hiển thị nội bộ; cho phép xuống dòng.',
  })
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  @MaxLength(TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH, { message: `Mô tả không được vượt quá ${TOUR_PROGRAM_DESCRIPTION_MAX_LENGTH} ký tự` })
  description?: string;
}
