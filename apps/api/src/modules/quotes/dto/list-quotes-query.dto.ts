import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const DEFAULT_QUOTES_TAKE = 100;
export const MAX_QUOTES_TAKE = 200;

export class ListQuotesQueryDto {
  @ApiPropertyOptional({ example: 'BG-2026', maxLength: LIST_SEARCH_MAX_LENGTH, description: 'Tu khoa tim kiem bao gia.' })
  @IsOptional()
  @IsString({ message: 'Tu khoa tim kiem bao gia phai la chuoi' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Tu khoa tim kiem bao gia khong duoc vuot qua ${LIST_SEARCH_MAX_LENGTH} ky tu` })
  search?: string;

  @ApiPropertyOptional({
    example: DEFAULT_QUOTES_TAKE,
    minimum: 1,
    maximum: MAX_QUOTES_TAKE,
    description: 'So bao gia toi da tra ve cho danh sach.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong bao gia can tai phai la so nguyen' })
  @Min(1, { message: 'So luong bao gia can tai phai lon hon 0' })
  @Max(MAX_QUOTES_TAKE, { message: `So luong bao gia can tai khong duoc vuot qua ${MAX_QUOTES_TAKE}` })
  take?: number;
}
