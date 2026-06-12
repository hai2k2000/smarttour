import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierDayType, SupplierStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsUUID,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimRequired = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const uppercaseRequired = ({ value }: { value: unknown }) => {
  const trimmed = trimRequired({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};
const maxHotelBuiltYear = new Date().getFullYear();
const supplierPhonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;
const supplierDateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const supplierUrlOptions = { protocols: ['http', 'https'], require_protocol: true };
const maxSupplierMoney = 999_999_999_999;

class SupplierContactInputDto {
  @ApiProperty()
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập tên người liên hệ' })
  @IsString({ message: 'Tên người liên hệ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên người liên hệ phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên người liên hệ không được vượt quá 180 ký tự' })
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Chức vụ người liên hệ phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Chức vụ người liên hệ không được vượt quá 120 ký tự' })
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @Matches(supplierDateOnlyPattern, { message: 'Ngày sinh người liên hệ phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Ngày sinh người liên hệ không hợp lệ' })
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Số điện thoại người liên hệ phải là chuỗi ký tự' })
  @MaxLength(30, { message: 'Số điện thoại người liên hệ không được vượt quá 30 ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại người liên hệ không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsEmail({}, { message: 'Email người liên hệ không hợp lệ' })
  @MaxLength(180, { message: 'Email người liên hệ không được vượt quá 180 ký tự' })
  email?: string;
}

class SupplierServiceInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã dịch vụ phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã dịch vụ không được vượt quá 80 ký tự' })
  sku?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập tên dịch vụ' })
  @IsString({ message: 'Tên dịch vụ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên dịch vụ phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên dịch vụ không được vượt quá 180 ký tự' })
  serviceName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @Matches(supplierDateOnlyPattern, { message: 'Ngày bắt đầu dịch vụ phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Ngày bắt đầu dịch vụ không hợp lệ' })
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @Matches(supplierDateOnlyPattern, { message: 'Ngày kết thúc dịch vụ phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Ngày kết thúc dịch vụ không hợp lệ' })
  endDate?: string;

  @ApiPropertyOptional({ enum: SupplierDayType })
  @IsOptional()
  @IsEnum(SupplierDayType, { message: 'Loại ngày dịch vụ không hợp lệ' })
  dayType?: SupplierDayType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá kế toán dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá kế toán dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá kế toán dịch vụ không được vượt quá 999.999.999.999' })
  accountingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá thuần dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá thuần dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá thuần dịch vụ không được vượt quá 999.999.999.999' })
  netPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá bán dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá bán dịch vụ không được vượt quá 999.999.999.999' })
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mô tả dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Mô tả dịch vụ không được vượt quá 2.000 ký tự' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú dịch vụ không được vượt quá 2.000 ký tự' })
  note?: string;
}

class SupplierAllotmentInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã quỹ phòng phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã quỹ phòng không được vượt quá 80 ký tự' })
  sku?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tên quỹ phòng phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên quỹ phòng phải có ít nhất 2 ký tự' })
  serviceName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsDateString({}, { message: 'Ngày bắt đầu quỹ phòng không hợp lệ' })
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsDateString({}, { message: 'Ngày kết thúc quỹ phòng không hợp lệ' })
  endDate?: string;

  @ApiPropertyOptional({ enum: SupplierDayType })
  @IsOptional()
  @IsEnum(SupplierDayType, { message: 'Loại ngày quỹ phòng không hợp lệ' })
  dayType?: SupplierDayType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tổng quỹ phòng phải là số nguyên' })
  @Min(0, { message: 'Tổng quỹ phòng không được âm' })
  allotmentQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phòng đã đặt phải là số nguyên' })
  @Min(0, { message: 'Số phòng đã đặt không được âm' })
  bookedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phòng đang giữ phải là số nguyên' })
  @Min(0, { message: 'Số phòng đang giữ không được âm' })
  lockedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng khóa phòng phải là số nguyên' })
  @Min(0, { message: 'Số lượng khóa phòng không được âm' })
  quantityLock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số ngày chốt quỹ phòng phải là số nguyên' })
  @Min(0, { message: 'Số ngày chốt quỹ phòng không được âm' })
  cutoffDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá thuần mỗi ngày phải là số hợp lệ' })
  @Min(0, { message: 'Giá thuần mỗi ngày không được âm' })
  netCostPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán mỗi ngày phải là số hợp lệ' })
  @Min(0, { message: 'Giá bán mỗi ngày không được âm' })
  sellingPricePerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mô tả quỹ phòng phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Mô tả quỹ phòng không được vượt quá 2.000 ký tự' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú quỹ phòng phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú quỹ phòng không được vượt quá 2.000 ký tự' })
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'STOP_SELL'], { message: 'Trạng thái quỹ phòng không hợp lệ' })
  status?: string;
}

export class CreateHotelSupplierDto {
  @ApiProperty()
  @Transform(uppercaseRequired)
  @IsString({ message: 'Mã nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(80, { message: 'Mã nhà cung cấp không được vượt quá 80 ký tự' })
  supplierCode!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên nhà cung cấp không được vượt quá 180 ký tự' })
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã số thuế phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã số thuế không được vượt quá 80 ký tự' })
  taxCode?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Số điện thoại nhà cung cấp phải là chuỗi ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại nhà cung cấp không hợp lệ' })
  phone!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email nhà cung cấp không hợp lệ' })
  @MaxLength(180, { message: 'Email nhà cung cấp không được vượt quá 180 ký tự' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Quốc gia phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Quốc gia không được vượt quá 120 ký tự' })
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsUrl(supplierUrlOptions, { message: 'Website nhà cung cấp phải là URL hợp lệ bắt đầu bằng http:// hoặc https://' })
  @MaxLength(500, { message: 'Website không được vượt quá 500 ký tự' })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú nhà cung cấp không được vượt quá 2.000 ký tự' })
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm xây dựng phải là số nguyên' })
  @Min(1800, { message: 'Năm xây dựng không được nhỏ hơn 1800' })
  @Max(maxHotelBuiltYear, { message: `Năm xây dựng không được lớn hơn ${maxHotelBuiltYear}` })
  builtYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Xếp hạng khách sạn phải là số nguyên' })
  @Min(0, { message: 'Xếp hạng khách sạn không được nhỏ hơn 0' })
  @Max(5, { message: 'Xếp hạng khách sạn không được lớn hơn 5' })
  rating?: number;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Hạng khách sạn phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Hạng khách sạn phải có ít nhất 2 ký tự' })
  @MaxLength(80, { message: 'Hạng khách sạn không được vượt quá 80 ký tự' })
  classHotel!: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Dự án khách sạn phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Dự án khách sạn phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Dự án khách sạn không được vượt quá 180 ký tự' })
  hotelProject!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tên tài khoản ngân hàng phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Tên tài khoản ngân hàng không được vượt quá 180 ký tự' })
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Số tài khoản ngân hàng phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Số tài khoản ngân hàng không được vượt quá 80 ký tự' })
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Tên ngân hàng không được vượt quá 180 ký tự' })
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsUrl(supplierUrlOptions, { message: 'Liên kết tham khảo phải là URL hợp lệ bắt đầu bằng http:// hoặc https://' })
  @MaxLength(500, { message: 'Liên kết không được vượt quá 500 ký tự' })
  link?: string;

  @ApiPropertyOptional({ enum: SupplierStatus })
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @ApiPropertyOptional({ type: [SupplierContactInputDto] })
  @IsOptional()
  @IsArray({ message: 'Danh sách người liên hệ phải là danh sách hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => SupplierContactInputDto)
  contacts?: SupplierContactInputDto[];

  @ApiPropertyOptional({ type: [SupplierServiceInputDto] })
  @IsOptional()
  @IsArray({ message: 'Danh sách dịch vụ khách sạn phải là danh sách hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => SupplierServiceInputDto)
  services?: SupplierServiceInputDto[];

  @ApiPropertyOptional({ type: [SupplierAllotmentInputDto] })
  @IsOptional()
  @IsArray({ message: 'Danh sách quỹ phòng phải là danh sách hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => SupplierAllotmentInputDto)
  allotments?: SupplierAllotmentInputDto[];
}

export class UpdateHotelSupplierDto extends PartialType(CreateHotelSupplierDto) {}

export class UpdateSupplierStatusDto {
  @ApiProperty({ enum: SupplierStatus })
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status!: SupplierStatus;
}

export class OverrideAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tổng quỹ phòng phải là số nguyên' })
  @Min(0, { message: 'Tổng quỹ phòng không được âm' })
  allotmentQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phòng đã đặt phải là số nguyên' })
  @Min(0, { message: 'Số phòng đã đặt không được âm' })
  bookedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phòng đang giữ phải là số nguyên' })
  @Min(0, { message: 'Số phòng đang giữ không được âm' })
  lockedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'STOP_SELL'], { message: 'Trạng thái quỹ phòng không hợp lệ' })
  status?: string;

  @ApiProperty()
  @Transform(trimRequired)
  @IsString({ message: 'Lý do điều chỉnh quỹ phòng phải là chuỗi ký tự' })
  @MinLength(3, { message: 'Lý do điều chỉnh quỹ phòng phải có ít nhất 3 ký tự' })
  @MaxLength(500, { message: 'Lý do điều chỉnh quỹ phòng không được vượt quá 500 ký tự' })
  note!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Người thực hiện phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Người thực hiện không được vượt quá 180 ký tự' })
  actor?: string;
}

export class LockAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Mã dịch vụ nhà cung cấp không hợp lệ' })
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Mã đơn hàng không hợp lệ' })
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Mã booking không hợp lệ' })
  bookingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Mã tour không hợp lệ' })
  tourId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số phòng giữ chỗ phải là số nguyên' })
  @Min(1, { message: 'Số phòng giữ chỗ phải lớn hơn 0' })
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú giữ chỗ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Ghi chú giữ chỗ không được vượt quá 500 ký tự' })
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Người thực hiện phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Người thực hiện không được vượt quá 180 ký tự' })
  actor?: string;
}

export class ReleaseAllotmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú thao tác phân bổ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Ghi chú thao tác phân bổ không được vượt quá 500 ký tự' })
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Người thực hiện phải là chuỗi ký tự' })
  @MaxLength(180, { message: 'Người thực hiện không được vượt quá 180 ký tự' })
  actor?: string;
}
