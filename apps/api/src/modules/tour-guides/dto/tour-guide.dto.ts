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

class GuideCardDto {
  @ApiProperty() @Trimmed() @IsString() @MinLength(2) @MaxLength(80) cardType!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) cardNumber?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString() expiredDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(120) issuePlace?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class GuideDocumentDto {
  @ApiProperty() @Trimmed() @IsString() @MinLength(2) @MaxLength(80) documentType!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) documentNo?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) country?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString() expiredDate?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(120) issuePlace?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class GuideCostServiceDto {
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) serviceType?: string;
  @ApiProperty() @Trimmed() @IsString() @MinLength(2) @MaxLength(160) serviceName!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sellingPrice?: number;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class GuideScheduleDto {
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() tourId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(160) title?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional({ enum: GUIDE_SCHEDULE_STATUSES }) @EmptyToUndefined() @Trimmed() @IsOptional() @IsIn(GUIDE_SCHEDULE_STATUSES) status?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateTourGuideDto {
  @ApiProperty() @Trimmed() @IsString() @MinLength(2) @MaxLength(40) @Matches(/^[A-Za-z0-9_-]+$/) guideCode!: string;
  @ApiProperty() @Trimmed() @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(40) taxCode?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @IsOptional() @IsDateString() birthday?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(30) gender?: string;
  @ApiProperty() @Trimmed() @IsString() @Matches(/^[0-9+().\-\s]{6,32}$/) phone!: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) provinceId?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(160) bankAccountName?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) bankAccountNumber?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(160) bankName?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) link?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) guideType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) markets?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(80) frequency?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @ApiPropertyOptional({ enum: GUIDE_STATUSES }) @EmptyToUndefined() @Trimmed() @IsOptional() @IsIn(GUIDE_STATUSES) status?: string;
  @ApiPropertyOptional() @EmptyToUndefined() @Trimmed() @IsOptional() @IsString() @MaxLength(120) createdBy?: string;
  @ApiPropertyOptional({ type: [GuideCardDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideCardDto) cards?: GuideCardDto[];
  @ApiPropertyOptional({ type: [GuideDocumentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideDocumentDto) documents?: GuideDocumentDto[];
  @ApiPropertyOptional({ type: [GuideCostServiceDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideCostServiceDto) costServices?: GuideCostServiceDto[];
  @ApiPropertyOptional({ type: [GuideScheduleDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideScheduleDto) schedules?: GuideScheduleDto[];
}

export class UpdateTourGuideDto extends PartialType(CreateTourGuideDto) {}
