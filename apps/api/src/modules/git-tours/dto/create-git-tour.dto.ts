import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, TourStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const GIT_TOUR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GIT_TOUR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/i;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeEnum = ({ value }: { value: unknown }) => {
  const trimmed = trimOptional({ value });
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
};

const compactChildRows = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) return value;
  return value.filter((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return Object.values(row as Record<string, unknown>).some((item) => {
      if (item === null || item === undefined) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === 'object') return Object.keys(item).length > 0;
      return true;
    });
  });
};

export class CreateGitTourDto {
  @ApiProperty({ example: 'GIT-2026-0001' })
  @Transform(trimOptional)
  @IsString({ message: 'Mã hệ thống tour GIT phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã hệ thống tour GIT cần ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Mã hệ thống tour GIT không được vượt quá 50 ký tự' })
  @Matches(GIT_TOUR_CODE_PATTERN, { message: 'Mã hệ thống tour GIT chỉ được gồm chữ, số, dấu gạch ngang, gạch dưới, dấu chấm hoặc dấu gạch chéo' })
  systemCode!: string;

  @ApiProperty({ example: 'GIT-HN-DN-001' })
  @Transform(trimOptional)
  @IsString({ message: 'Mã tour GIT phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Mã tour GIT cần ít nhất 2 ký tự' })
  @MaxLength(50, { message: 'Mã tour GIT không được vượt quá 50 ký tự' })
  @Matches(GIT_TOUR_CODE_PATTERN, { message: 'Mã tour GIT chỉ được gồm chữ, số, dấu gạch ngang, gạch dưới, dấu chấm hoặc dấu gạch chéo' })
  tourCode!: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Mã đơn hàng liên kết tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Mã đơn hàng liên kết tour GIT không được vượt quá 200 ký tự' })
  orderId?: string;

  @ApiProperty({ example: 'Đoàn công ty ABC Đà Nẵng 4N3Đ' })
  @Transform(trimOptional)
  @IsString({ message: 'Tên tour GIT phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên tour GIT cần ít nhất 2 ký tự' })
  @MaxLength(200, { message: 'Tên tour GIT không được vượt quá 200 ký tự' })
  name!: string;

  @ApiPropertyOptional({ enum: TourStatus })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(TourStatus, { message: 'Trạng thái tour GIT không hợp lệ' })
  status?: TourStatus;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Bước workflow tour GIT phải là chuỗi ký tự' })
  @MaxLength(50, { message: 'Bước workflow tour GIT không được vượt quá 50 ký tự' })
  workflowStep?: string;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @Transform(normalizeEnum)
  @IsOptional()
  @IsEnum(PaymentStatus, { message: 'Trạng thái thanh toán tour GIT không hợp lệ' })
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Mã giữ chỗ tour GIT phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Mã giữ chỗ tour GIT không được vượt quá 100 ký tự' })
  holdCode?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tuyến điểm tour GIT phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Tuyến điểm tour GIT không được vượt quá 500 ký tự' })
  route?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tóm tắt lịch trình tour GIT phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Tóm tắt lịch trình tour GIT không được vượt quá 1000 ký tự' })
  itinerarySummary?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Nhóm thị trường tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Nhóm thị trường tour GIT không được vượt quá 200 ký tự' })
  marketGroup?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ngày booking GIT phải là chuỗi ngày' })
  @Matches(GIT_TOUR_DATE_PATTERN, { message: 'Ngày booking GIT phải có định dạng YYYY-MM-DD' })
  bookingDate?: string;

  @ApiPropertyOptional({ example: '2026-06-20' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ngày hạn thanh toán GIT phải là chuỗi ngày' })
  @Matches(GIT_TOUR_DATE_PATTERN, { message: 'Ngày hạn thanh toán GIT phải có định dạng YYYY-MM-DD' })
  paymentDueDate?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ngày khởi hành GIT phải là chuỗi ngày' })
  @Matches(GIT_TOUR_DATE_PATTERN, { message: 'Ngày khởi hành GIT phải có định dạng YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-18' })
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ngày kết thúc GIT phải là chuỗi ngày' })
  @Matches(GIT_TOUR_DATE_PATTERN, { message: 'Ngày kết thúc GIT phải có định dạng YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tên khách hàng tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Tên khách hàng tour GIT không được vượt quá 200 ký tự' })
  customerName?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tên đại lý tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Tên đại lý tour GIT không được vượt quá 200 ký tự' })
  agentName?: string;

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Khách hàng tour GIT phải là danh sách hợp lệ' })
  customers?: unknown[];

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Nhân viên điều hành tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Nhân viên điều hành tour GIT không được vượt quá 200 ký tự' })
  operatorOwner?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Cộng tác viên tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Cộng tác viên tour GIT không được vượt quá 200 ký tự' })
  collaborator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Tỷ lệ hoa hồng GIT phải là số hợp lệ' })
  @Min(0, { message: 'Tỷ lệ hoa hồng GIT không được âm' })
  @Max(100, { message: 'Tỷ lệ hoa hồng GIT không được vượt quá 100%' })
  commissionRate?: number;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Trạng thái hóa đơn tour GIT phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Trạng thái hóa đơn tour GIT không được vượt quá 100 ký tự' })
  invoiceStatus?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Tài khoản tour GIT phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Tài khoản tour GIT không được vượt quá 100 ký tự' })
  accountCode?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Chi nhánh tour GIT phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Chi nhánh tour GIT không được vượt quá 100 ký tự' })
  branch?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Phòng ban tour GIT phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'Phòng ban tour GIT không được vượt quá 100 ký tự' })
  department?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Nguồn khách tour GIT phải là chuỗi ký tự' })
  @MaxLength(200, { message: 'Nguồn khách tour GIT không được vượt quá 200 ký tự' })
  customerSource?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Mã tiền tệ tour GIT phải là chuỗi ký tự' })
  @MaxLength(10, { message: 'Mã tiền tệ tour GIT không được vượt quá 10 ký tự' })
  exchangeRateCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Tỷ giá tour GIT phải là số hợp lệ' })
  @Min(0.000001, { message: 'Tỷ giá tour GIT phải lớn hơn 0' })
  @Max(1000000000, { message: 'Tỷ giá tour GIT không được vượt quá 1.000.000.000' })
  exchangeRate?: number;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ghi chú tour GIT phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'Ghi chú tour GIT không được vượt quá 2000 ký tự' })
  notes?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsOptional()
  @IsString({ message: 'Ghi chú hồ sơ tour GIT phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Ghi chú hồ sơ tour GIT không được vượt quá 1000 ký tự' })
  fileNote?: string;

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Doanh thu tour GIT phải là danh sách hợp lệ' })
  revenues?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Chi phí tour GIT phải là danh sách hợp lệ' })
  costs?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Dịch vụ dự toán tour GIT phải là danh sách hợp lệ' })
  budgetServices?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Dịch vụ điều hành tour GIT phải là danh sách hợp lệ' })
  operationServices?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Hướng dẫn viên tour GIT phải là danh sách hợp lệ' })
  guides?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Tệp đính kèm tour GIT phải là danh sách hợp lệ' })
  attachments?: unknown[];

  @ApiPropertyOptional({ type: Array })
  @Transform(compactChildRows)
  @IsOptional()
  @IsArray({ message: 'Câu hỏi đánh giá tour GIT phải là danh sách hợp lệ' })
  surveyQuestions?: unknown[];
}

export const GIT_TOUR_ROOT_FIELDS = [
  'systemCode',
  'tourCode',
  'orderId',
  'name',
  'paymentStatus',
  'route',
  'marketGroup',
  'bookingDate',
  'paymentDueDate',
  'startDate',
  'endDate',
  'operatorOwner',
  'branch',
  'department',
  'customerSource',
  'exchangeRateCode',
  'exchangeRate',
  'notes',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_LIFECYCLE_FIELDS = [
  'status',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_WORKFLOW_FIELDS = [
  'workflowStep',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_LINK_AND_CUSTOMER_FIELDS = [
  'customerName',
  'agentName',
  'customers',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_DETAIL_FIELDS = [
  'holdCode',
  'itinerarySummary',
  'collaborator',
  'commissionRate',
  'invoiceStatus',
  'accountCode',
  'fileNote',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_CHILD_FIELDS = [
  'revenues',
  'costs',
  'budgetServices',
  'operationServices',
  'guides',
  'attachments',
  'surveyQuestions',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_REQUIRED_CREATE_FIELDS = [
  'systemCode',
  'tourCode',
  'name',
] as const satisfies readonly (keyof CreateGitTourDto)[];

export const GIT_TOUR_ACTION_FIELDS = [
  'sourceTourId',
] as const;

export const GIT_TOUR_CREATE_FIELDS = [
  ...GIT_TOUR_ROOT_FIELDS,
  ...GIT_TOUR_LIFECYCLE_FIELDS,
  ...GIT_TOUR_WORKFLOW_FIELDS,
  ...GIT_TOUR_LINK_AND_CUSTOMER_FIELDS,
  ...GIT_TOUR_DETAIL_FIELDS,
  ...GIT_TOUR_CHILD_FIELDS,
] as const satisfies readonly (keyof CreateGitTourDto)[];
