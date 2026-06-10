import { ApiPropertyOptional } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LIST_SEARCH_MAX_LENGTH } from '../../list-search';

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
}
