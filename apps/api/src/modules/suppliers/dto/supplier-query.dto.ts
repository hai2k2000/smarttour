import { SupplierStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class HotelSupplierListQueryDto {
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Từ khóa tìm kiếm không được vượt quá 200 ký tự' })
  search?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Dự án khách sạn phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Dự án khách sạn không được vượt quá 180 ký tự' })
  hotelProject?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Hạng khách sạn phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Hạng khách sạn không được vượt quá 80 ký tự' })
  classHotel?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;
}

export class TypedSupplierListQueryDto {
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Từ khóa tìm kiếm không được vượt quá 200 ký tự' })
  search?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;
}

export class AllotmentInventoryQueryDto {
  @Transform(trimOptional)
  @IsOptional()
  @IsUUID('4', { message: 'Mã nhà cung cấp không hợp lệ' })
  supplierId?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startDate?: string;

  @Transform(trimOptional)
  @IsOptional()
  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  endDate?: string;
}
