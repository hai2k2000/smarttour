import { ApiPropertyOptional } from '@nestjs/swagger';
import { FitTourWorkflowStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const DEFAULT_FIT_TOURS_TAKE = 100;
export const MAX_FIT_TOURS_TAKE = 200;

const trimSearch = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || undefined;
};

const normalizeStatus = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
};

export class ListFitToursQueryDto {
  @ApiPropertyOptional({ example: 'FIT-2026', maxLength: LIST_SEARCH_MAX_LENGTH, description: 'Tu khoa tim kiem tour FIT.' })
  @Transform(trimSearch)
  @IsOptional()
  @IsString({ message: 'Tu khoa tim kiem tour FIT phai la chuoi' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Tu khoa tim kiem tour FIT khong duoc vuot qua ${LIST_SEARCH_MAX_LENGTH} ky tu` })
  search?: string;

  @ApiPropertyOptional({ enum: FitTourWorkflowStatus, description: 'Trang thai workflow FIT.' })
  @Transform(normalizeStatus)
  @IsOptional()
  @IsEnum(FitTourWorkflowStatus, { message: 'Trang thai workflow FIT khong hop le' })
  status?: FitTourWorkflowStatus;

  @ApiPropertyOptional({
    example: DEFAULT_FIT_TOURS_TAKE,
    minimum: 1,
    maximum: MAX_FIT_TOURS_TAKE,
    description: 'So tour FIT toi da tra ve cho danh sach.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'So luong tour FIT can tai phai la so nguyen' })
  @Min(1, { message: 'So luong tour FIT can tai phai lon hon 0' })
  @Max(MAX_FIT_TOURS_TAKE, { message: `So luong tour FIT can tai khong duoc vuot qua ${MAX_FIT_TOURS_TAKE}` })
  take?: number;
}
