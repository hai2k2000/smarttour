import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const GUIDE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const GUIDE_SCHEDULE_STATUSES = ['AVAILABLE', 'BUSY', 'CONFIRMED', 'OPERATING', 'COMPLETED', 'CANCELLED'] as const;

function Trimmed() {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

function EmptyToUndefined() {
  return Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));
}

function EmptyNumberToUndefined() {
  return Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : value));
}

function CompactStringArray() {
  return Transform(({ value }) => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : item)).filter(Boolean) : value));
}

function CompactRows(keys: string[]) {
  return Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      return keys.some((key) => {
        const field = (item as Record<string, unknown>)[key];
        return typeof field === 'string' ? field.trim().length > 0 : field !== undefined && field !== null && field !== '';
      });
    });
  });
}

class GuideCardDto {
  @ApiProperty() @Trimmed() @IsString({ message: 'Loại thẻ phải là chuỗi' }) @MinLength(2, { message: 'Loại thẻ tối thiểu 2 ký tự' }) @MaxLength(80, { message: 'Loại thẻ không được vượt quá 80 ký tự' }) cardType!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Số thẻ phải là chuỗi' }) @MaxLength(80, { message: 'Số thẻ không được vượt quá 80 ký tự' }) cardNumber?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString({}, { message: 'Ngày cấp thẻ không hợp lệ' }) issueDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString({}, { message: 'Ngày hết hạn thẻ không hợp lệ' }) expiredDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Nơi cấp thẻ phải là chuỗi' }) @MaxLength(120, { message: 'Nơi cấp thẻ không được vượt quá 120 ký tự' }) issuePlace?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Đường dẫn file thẻ phải là chuỗi' }) @MaxLength(500, { message: 'Đường dẫn file thẻ không được vượt quá 500 ký tự' }) fileUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ghi chú thẻ phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú thẻ không được vượt quá 500 ký tự' }) note?: string;
}

class GuideDocumentDto {
  @ApiProperty() @Trimmed() @IsString({ message: 'Loại giấy tờ phải là chuỗi' }) @MinLength(2, { message: 'Loại giấy tờ tối thiểu 2 ký tự' }) @MaxLength(80, { message: 'Loại giấy tờ không được vượt quá 80 ký tự' }) documentType!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Số giấy tờ phải là chuỗi' }) @MaxLength(80, { message: 'Số giấy tờ không được vượt quá 80 ký tự' }) documentNo?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Quốc gia phải là chuỗi' }) @MaxLength(80, { message: 'Quốc gia không được vượt quá 80 ký tự' }) country?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString({}, { message: 'Ngày cấp giấy tờ không hợp lệ' }) issueDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString({}, { message: 'Ngày hết hạn giấy tờ không hợp lệ' }) expiredDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Nơi cấp giấy tờ phải là chuỗi' }) @MaxLength(120, { message: 'Nơi cấp giấy tờ không được vượt quá 120 ký tự' }) issuePlace?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Đường dẫn file giấy tờ phải là chuỗi' }) @MaxLength(500, { message: 'Đường dẫn file giấy tờ không được vượt quá 500 ký tự' }) fileUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ghi chú giấy tờ phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú giấy tờ không được vượt quá 500 ký tự' }) note?: string;
}

class GuideCostServiceDto {
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Loại dịch vụ phải là chuỗi' }) @MaxLength(80, { message: 'Loại dịch vụ không được vượt quá 80 ký tự' }) serviceType?: string;
  @ApiProperty() @Trimmed() @IsString({ message: 'Tên dịch vụ phải là chuỗi' }) @MinLength(2, { message: 'Tên dịch vụ tối thiểu 2 ký tự' }) @MaxLength(160, { message: 'Tên dịch vụ không được vượt quá 160 ký tự' }) serviceName!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Đơn vị tính phải là chuỗi' }) @MaxLength(40, { message: 'Đơn vị tính không được vượt quá 40 ký tự' }) unit?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Tiền tệ phải là chuỗi' }) @MaxLength(10, { message: 'Tiền tệ không được vượt quá 10 ký tự' }) currency?: string;
  @ApiPropertyOptional() @EmptyNumberToUndefined() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Giá NET phải là số' }) @Min(0, { message: 'Giá NET không được âm' }) netPrice?: number;
  @ApiPropertyOptional() @EmptyNumberToUndefined() @IsOptional() @Type(() => Number) @IsNumber({}, { message: 'Giá bán phải là số' }) @Min(0, { message: 'Giá bán không được âm' }) sellingPrice?: number;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ghi chú bảng giá phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú bảng giá không được vượt quá 500 ký tự' }) note?: string;
}

class GuideScheduleDto {
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Mã tour liên kết phải là chuỗi' }) tourId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Mã đơn hàng liên kết phải là chuỗi' }) orderId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Nội dung lịch phải là chuỗi' }) @MaxLength(160, { message: 'Nội dung lịch không được vượt quá 160 ký tự' }) title?: string;
  @ApiProperty() @IsDateString({}, { message: 'Ngày bắt đầu lịch điều hành không hợp lệ' }) startDate!: string;
  @ApiProperty() @IsDateString({}, { message: 'Ngày kết thúc lịch điều hành không hợp lệ' }) endDate!: string;
  @ApiPropertyOptional({ enum: GUIDE_SCHEDULE_STATUSES }) @EmptyToUndefined() @Trimmed() @IsOptional() @IsIn(GUIDE_SCHEDULE_STATUSES, { message: 'Trạng thái lịch điều hành không hợp lệ' }) status?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ghi chú lịch điều hành phải là chuỗi' }) @MaxLength(500, { message: 'Ghi chú lịch điều hành không được vượt quá 500 ký tự' }) note?: string;
}

export class CreateTourGuideDto {
  @ApiProperty() @Trimmed() @IsString({ message: 'Mã hướng dẫn viên phải là chuỗi' }) @MinLength(2, { message: 'Mã hướng dẫn viên tối thiểu 2 ký tự' }) @MaxLength(40, { message: 'Mã hướng dẫn viên không được vượt quá 40 ký tự' }) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã hướng dẫn viên chỉ được chứa chữ, số, dấu gạch ngang hoặc gạch dưới' }) guideCode!: string;
  @ApiProperty() @Trimmed() @IsString({ message: 'Họ tên hướng dẫn viên phải là chuỗi' }) @MinLength(2, { message: 'Họ tên hướng dẫn viên tối thiểu 2 ký tự' }) @MaxLength(160, { message: 'Họ tên hướng dẫn viên không được vượt quá 160 ký tự' }) fullName!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Mã số thuế phải là chuỗi' }) @MaxLength(40, { message: 'Mã số thuế không được vượt quá 40 ký tự' }) taxCode?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString({}, { message: 'Ngày sinh hướng dẫn viên không hợp lệ' }) birthday?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Giới tính phải là chuỗi' }) @MaxLength(30, { message: 'Giới tính không được vượt quá 30 ký tự' }) gender?: string;
  @ApiProperty() @Trimmed() @IsString({ message: 'Số điện thoại hướng dẫn viên phải là chuỗi' }) @Matches(/^[0-9+().\-\s]{6,32}$/, { message: 'Số điện thoại hướng dẫn viên không hợp lệ' }) phone!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsEmail({}, { message: 'Email hướng dẫn viên không hợp lệ' }) @MaxLength(160, { message: 'Email hướng dẫn viên không được vượt quá 160 ký tự' }) email?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Địa chỉ phải là chuỗi' }) @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' }) address?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Tỉnh/TP phải là chuỗi' }) @MaxLength(80, { message: 'Tỉnh/TP không được vượt quá 80 ký tự' }) provinceId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Chủ tài khoản phải là chuỗi' }) @MaxLength(160, { message: 'Chủ tài khoản không được vượt quá 160 ký tự' }) bankAccountName?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Số tài khoản phải là chuỗi' }) @MaxLength(80, { message: 'Số tài khoản không được vượt quá 80 ký tự' }) bankAccountNumber?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ngân hàng phải là chuỗi' }) @MaxLength(160, { message: 'Ngân hàng không được vượt quá 160 ký tự' }) bankName?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Liên kết hồ sơ phải là chuỗi' }) @MaxLength(500, { message: 'Liên kết hồ sơ không được vượt quá 500 ký tự' }) link?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Mô tả phải là chuỗi' }) @MaxLength(1000, { message: 'Mô tả không được vượt quá 1000 ký tự' }) description?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Loại hướng dẫn viên phải là chuỗi' }) @MaxLength(80, { message: 'Loại hướng dẫn viên không được vượt quá 80 ký tự' }) guideType?: string;
  @ApiPropertyOptional({ type: [String] }) @CompactStringArray() @IsOptional() @IsArray({ message: 'Ngôn ngữ phải là mảng' }) @IsString({ each: true, message: 'Từng ngôn ngữ phải là chuỗi' }) @MaxLength(80, { each: true, message: 'Từng ngôn ngữ không được vượt quá 80 ký tự' }) languages?: string[];
  @ApiPropertyOptional({ type: [String] }) @CompactStringArray() @IsOptional() @IsArray({ message: 'Thị trường phải là mảng' }) @IsString({ each: true, message: 'Từng thị trường phải là chuỗi' }) @MaxLength(80, { each: true, message: 'Từng thị trường không được vượt quá 80 ký tự' }) markets?: string[];
  @ApiPropertyOptional({ type: [String] }) @CompactStringArray() @IsOptional() @IsArray({ message: 'Kỹ năng phải là mảng' }) @IsString({ each: true, message: 'Từng kỹ năng phải là chuỗi' }) @MaxLength(80, { each: true, message: 'Từng kỹ năng không được vượt quá 80 ký tự' }) skills?: string[];
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Tần suất phải là chuỗi' }) @MaxLength(80, { message: 'Tần suất không được vượt quá 80 ký tự' }) frequency?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ảnh đại diện phải là chuỗi' }) @MaxLength(500, { message: 'Ảnh đại diện không được vượt quá 500 ký tự' }) avatarUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Ghi chú hồ sơ phải là chuỗi' }) @MaxLength(1000, { message: 'Ghi chú hồ sơ không được vượt quá 1000 ký tự' }) comment?: string;
  @ApiPropertyOptional({ enum: GUIDE_STATUSES }) @EmptyToUndefined() @Trimmed() @IsOptional() @IsIn(GUIDE_STATUSES, { message: 'Trạng thái hướng dẫn viên không hợp lệ' }) status?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString({ message: 'Người tạo phải là chuỗi' }) @MaxLength(120, { message: 'Người tạo không được vượt quá 120 ký tự' }) createdBy?: string;
  @ApiPropertyOptional({ type: [GuideCardDto] }) @CompactRows(['cardType', 'cardNumber', 'issueDate', 'expiredDate', 'issuePlace', 'fileUrl', 'note']) @IsOptional() @IsArray({ message: 'Danh sách thẻ phải là mảng' }) @ValidateNested({ each: true }) @Type(() => GuideCardDto) cards?: GuideCardDto[];
  @ApiPropertyOptional({ type: [GuideDocumentDto] }) @CompactRows(['documentType', 'documentNo', 'country', 'issueDate', 'expiredDate', 'issuePlace', 'fileUrl', 'note']) @IsOptional() @IsArray({ message: 'Danh sách giấy tờ phải là mảng' }) @ValidateNested({ each: true }) @Type(() => GuideDocumentDto) documents?: GuideDocumentDto[];
  @ApiPropertyOptional({ type: [GuideCostServiceDto] }) @CompactRows(['serviceType', 'serviceName', 'unit', 'currency', 'netPrice', 'sellingPrice', 'note']) @IsOptional() @IsArray({ message: 'Bảng giá dịch vụ phải là mảng' }) @ValidateNested({ each: true }) @Type(() => GuideCostServiceDto) costServices?: GuideCostServiceDto[];
  @ApiPropertyOptional({ type: [GuideScheduleDto] }) @CompactRows(['tourId', 'orderId', 'title', 'startDate', 'endDate', 'status', 'note']) @IsOptional() @IsArray({ message: 'Lịch điều hành phải là mảng' }) @ValidateNested({ each: true }) @Type(() => GuideScheduleDto) schedules?: GuideScheduleDto[];
}

export class UpdateTourGuideDto extends PartialType(CreateTourGuideDto) {}
