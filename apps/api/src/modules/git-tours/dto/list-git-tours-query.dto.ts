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

export class ListGitToursQueryDto {
  @ApiPropertyOptional({
    example: 'GIT Hà Nội Đà Nẵng',
    maxLength: LIST_SEARCH_MAX_LENGTH,
    description: 'Tìm theo mã hệ thống, mã tour, tên tour, nhân sự điều hành hoặc khách/đại lý của tour GIT. Chuỗi dưới 2 ký tự được xem như không lọc.',
  })
  @Transform(trimSearch)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm tour GIT phải là chuỗi ký tự' })
  @MaxLength(LIST_SEARCH_MAX_LENGTH, { message: `Từ khóa tìm kiếm tour GIT không được vượt quá ${LIST_SEARCH_MAX_LENGTH} ký tự` })
  search?: string;

  @ApiPropertyOptional({
    enum: TourStatus,
    description: 'Lọc danh sách tour GIT theo trạng thái tour.',
  })
  @Transform(normalizeStatus)
  @IsOptional()
  @IsEnum(TourStatus, { message: 'Trạng thái tour GIT không hợp lệ' })
  status?: TourStatus;
}
