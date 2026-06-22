import { ApiPropertyOptional } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

export const DEFAULT_LANDTOURS_TAKE = 100;
export const MAX_LANDTOURS_TAKE = 200;

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

export class ListLandToursQueryDto {
  @ApiPropertyOptional({
    example: 'LandTour Đà Nẵng',
    maxLength: LIST_SEARCH_MAX_LENGTH,
    description: 'Tìm theo mã hệ thống, mã tour, tên tour, tuyến điểm, khách hàng hoặc hướng dẫn viên của LandTour. Chuỗi dưới 2 ký tự được xem như không lọc.',
  })
  @Transform(trimSearch)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm LandTour phải là chuỗi ký tự' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Từ khóa tìm kiếm LandTour không được vượt quá ${LIST_SEARCH_MAX_LENGTH} ký tự` })
  search?: string;

  @ApiPropertyOptional({
    enum: TourStatus,
    description: 'Lọc danh sách LandTour theo trạng thái tour.',
  })
  @Transform(normalizeStatus)
  @IsOptional()
  @IsEnum(TourStatus, { message: 'Trạng thái LandTour không hợp lệ' })
  status?: TourStatus;

  @ApiPropertyOptional({
    example: DEFAULT_LANDTOURS_TAKE,
    minimum: 1,
    maximum: MAX_LANDTOURS_TAKE,
    description: 'Số LandTour tối đa trả về cho danh sách.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Số lượng LandTour cần tải phải là số nguyên' })
  @Min(1, { message: 'Số lượng LandTour cần tải phải lớn hơn 0' })
  @Max(MAX_LANDTOURS_TAKE, { message: `Số lượng LandTour cần tải không được vượt quá ${MAX_LANDTOURS_TAKE}` })
  take?: number;
}
