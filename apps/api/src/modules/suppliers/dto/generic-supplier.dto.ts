import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  Matches,
  Max,
  MaxLength,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
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
const supplierPhonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d\s().-]+$/;
const supplierDateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const supplierUrlOptions = { protocols: ['http', 'https'], require_protocol: true };
const maxSupplierMoney = 999_999_999_999;

class GenericSupplierContactDto {
  @ApiProperty({ description: 'Họ tên người liên hệ của nhà cung cấp' })
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập tên người liên hệ' })
  @IsString({ message: 'Tên người liên hệ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên người liên hệ phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên người liên hệ không được vượt quá 180 ký tự' })
  fullName!: string;

  @ApiPropertyOptional({ description: 'Chức vụ hoặc vai trò của người liên hệ' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Chức vụ người liên hệ phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Chức vụ người liên hệ không được vượt quá 120 ký tự' })
  position?: string;

  @ApiPropertyOptional({ description: 'Ngày sinh người liên hệ theo định dạng YYYY-MM-DD' })
  @IsOptional()
  @Transform(trimOptional)
  @Matches(supplierDateOnlyPattern, { message: 'Ngày sinh người liên hệ phải có định dạng YYYY-MM-DD' })
  @IsDateString({}, { message: 'Ngày sinh người liên hệ không hợp lệ' })
  birthday?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại người liên hệ, từ 6 đến 15 chữ số' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Số điện thoại người liên hệ phải là chuỗi ký tự' })
  @MaxLength(30, { message: 'Số điện thoại người liên hệ không được vượt quá 30 ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại người liên hệ không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Email người liên hệ' })
  @Transform(trimOptional)
  @IsOptional()
  @IsEmail({}, { message: 'Email người liên hệ không hợp lệ' })
  @MaxLength(180, { message: 'Email người liên hệ không được vượt quá 180 ký tự' })
  email?: string;
}

class GenericSupplierServiceDto {
  @ApiPropertyOptional({ description: 'Mã dịch vụ nội bộ, không được trùng trong cùng nhà cung cấp' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mã dịch vụ phải là chuỗi ký tự' })
  @MaxLength(80, { message: 'Mã dịch vụ không được vượt quá 80 ký tự' })
  sku?: string;

  @ApiProperty({ description: 'Tên dịch vụ nhà cung cấp đang bán hoặc vận hành' })
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập tên dịch vụ' })
  @IsString({ message: 'Tên dịch vụ phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên dịch vụ phải có ít nhất 2 ký tự' })
  @MaxLength(180, { message: 'Tên dịch vụ không được vượt quá 180 ký tự' })
  serviceName!: string;

  @ApiPropertyOptional({ description: 'Số lượng mặc định của dòng dịch vụ nếu nghiệp vụ cần theo dõi' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượng dịch vụ phải là số nguyên' })
  @Min(0, { message: 'Số lượng dịch vụ không được âm' })
  quantity?: number;

  @ApiPropertyOptional({ description: 'Giá kế toán của dịch vụ' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá kế toán dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá kế toán dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá kế toán dịch vụ không được vượt quá 999.999.999.999' })
  accountingPrice?: number;

  @ApiPropertyOptional({ description: 'Giá thuần NET của dịch vụ' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá thuần dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá thuần dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá thuần dịch vụ không được vượt quá 999.999.999.999' })
  netPrice?: number;

  @ApiPropertyOptional({ description: 'Giá bán của dịch vụ' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán dịch vụ phải là số hợp lệ' })
  @Min(0, { message: 'Giá bán dịch vụ không được âm' })
  @Max(maxSupplierMoney, { message: 'Giá bán dịch vụ không được vượt quá 999.999.999.999' })
  sellingPrice?: number;

  @ApiPropertyOptional({ description: 'Mô tả ngắn về phạm vi dịch vụ' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Mô tả dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Mô tả dịch vụ không được vượt quá 2.000 ký tự' })
  description?: string;

  @ApiPropertyOptional({ description: 'Ghi chú vận hành hoặc chính sách riêng của dịch vụ' })
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Ghi chú dịch vụ phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú dịch vụ không được vượt quá 2.000 ký tự' })
  note?: string;

  @ApiPropertyOptional({ description: 'Metadata theo loại nhà cung cấp; chỉ nhận các field được backend hỗ trợ' })
  @IsOptional()
  @IsObject({ message: 'Metadata dịch vụ phải là object hợp lệ' })
  metadata?: Record<string, unknown>;
}

export class CreateGenericSupplierDto {
  @ApiProperty({ description: 'Mã nhà cung cấp; hệ thống sẽ trim và viết hoa trước khi lưu' })
  @Transform(uppercaseRequired)
  @IsNotEmpty({ message: 'Cần nhập mã nhà cung cấp' })
  @IsString({ message: 'Mã nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(80, { message: 'Mã nhà cung cấp không được vượt quá 80 ký tự' })
  supplierCode!: string;

  @ApiProperty({ description: 'Tên hiển thị của nhà cung cấp' })
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập tên nhà cung cấp' })
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

  @ApiProperty({ description: 'Số điện thoại nhà cung cấp, từ 6 đến 15 chữ số' })
  @Transform(trimRequired)
  @IsNotEmpty({ message: 'Cần nhập số điện thoại nhà cung cấp' })
  @IsString({ message: 'Số điện thoại nhà cung cấp phải là chuỗi ký tự' })
  @Matches(supplierPhonePattern, { message: 'Số điện thoại nhà cung cấp không hợp lệ' })
  @MaxLength(40, { message: 'Số điện thoại nhà cung cấp không được vượt quá 40 ký tự' })
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
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Tỉnh/thành không được vượt quá 120 ký tự' })
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsUrl(supplierUrlOptions, { message: 'Website nhà cung cấp phải là URL hợp lệ bắt đầu bằng http:// hoặc https://' })
  @MaxLength(500, { message: 'Website không được vượt quá 500 ký tự' })
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsUrl(supplierUrlOptions, { message: 'Liên kết tham khảo phải là URL hợp lệ bắt đầu bằng http:// hoặc https://' })
  @MaxLength(500, { message: 'Liên kết không được vượt quá 500 ký tự' })
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Xếp hạng nhà cung cấp phải là số nguyên' })
  @Min(0, { message: 'Xếp hạng nhà cung cấp không được nhỏ hơn 0' })
  @Max(5, { message: 'Xếp hạng nhà cung cấp không được lớn hơn 5' })
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Thị trường phải là chuỗi ký tự' })
  @MaxLength(120, { message: 'Thị trường không được vượt quá 120 ký tự' })
  market?: string;

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
  @IsString({ message: 'Ghi chú nhà cung cấp phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú nhà cung cấp không được vượt quá 2.000 ký tự' })
  notes?: string;

  @ApiPropertyOptional({ enum: SupplierStatus, description: 'Trạng thái vòng đời nhà cung cấp' })
  @IsOptional()
  @IsEnum(SupplierStatus, { message: 'Trạng thái nhà cung cấp không hợp lệ' })
  status?: SupplierStatus;

  @ApiPropertyOptional({ type: [GenericSupplierContactDto], description: 'Danh sách liên hệ; gửi lên thì được validate từng dòng' })
  @IsOptional()
  @IsArray({ message: 'Danh sách người liên hệ phải là danh sách hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => GenericSupplierContactDto)
  contacts?: GenericSupplierContactDto[];

  @ApiPropertyOptional({ type: [GenericSupplierServiceDto], description: 'Danh sách dịch vụ; gửi lên thì được validate từng dòng' })
  @IsOptional()
  @IsArray({ message: 'Danh sách dịch vụ phải là danh sách hợp lệ' })
  @ValidateNested({ each: true })
  @Type(() => GenericSupplierServiceDto)
  services?: GenericSupplierServiceDto[];
}

export class UpdateGenericSupplierDto extends PartialType(CreateGenericSupplierDto) {}
