import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const DEFAULT_TOUR_PROGRAMS_TAKE = 100;
export const MAX_TOUR_PROGRAMS_TAKE = 200;

const trimSearch = ({ value }: { value: unknown }) => (
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value
);

export class ListTourProgramsQueryDto {
  @ApiPropertyOptional({
    example: 'Hạ Long',
    maxLength: LIST_SEARCH_MAX_LENGTH,
    description: 'Tìm theo mã, tên hoặc tuyến điểm tour mẫu. Chuỗi dưới 2 ký tự được xem như không lọc.',
  })
  @Transform(trimSearch)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Từ khóa tìm kiếm không được vượt quá ${LIST_SEARCH_MAX_LENGTH} ký tự` })
  search?: string;

  @ApiPropertyOptional({
    example: DEFAULT_TOUR_PROGRAMS_TAKE,
    minimum: 1,
    maximum: MAX_TOUR_PROGRAMS_TAKE,
    description: 'Số tour mẫu tối đa trả về cho danh sách. Dùng để tránh payload SSR quá lớn.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Số lượng tour mẫu cần tải phải là số nguyên' })
  @Min(1, { message: 'Số lượng tour mẫu cần tải phải lớn hơn 0' })
  @Max(MAX_TOUR_PROGRAMS_TAKE, { message: `Số lượng tour mẫu cần tải không được vượt quá ${MAX_TOUR_PROGRAMS_TAKE}` })
  take?: number;
}
