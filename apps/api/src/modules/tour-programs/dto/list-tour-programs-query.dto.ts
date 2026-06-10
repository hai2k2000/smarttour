import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

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
}
