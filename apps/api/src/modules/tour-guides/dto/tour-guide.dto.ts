import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

class GuideCardDto {
  @ApiProperty() @IsString() @MinLength(2) cardType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuePlace?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class GuideDocumentDto {
  @ApiProperty() @IsString() @MinLength(2) documentType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issuePlace?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class GuideCostServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() serviceType?: string;
  @ApiProperty() @IsString() @MinLength(2) serviceName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) netPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sellingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

class GuideScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tourId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiProperty() @IsString() startDate!: string;
  @ApiProperty() @IsString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateTourGuideDto {
  @ApiProperty() @IsString() @MinLength(2) guideCode!: string;
  @ApiProperty() @IsString() @MinLength(2) fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() birthday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiProperty() @IsString() @MinLength(6) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() provinceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guideType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() languages?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() markets?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() skills?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() frequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdBy?: string;
  @ApiPropertyOptional({ type: [GuideCardDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideCardDto) cards?: GuideCardDto[];
  @ApiPropertyOptional({ type: [GuideDocumentDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideDocumentDto) documents?: GuideDocumentDto[];
  @ApiPropertyOptional({ type: [GuideCostServiceDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideCostServiceDto) costServices?: GuideCostServiceDto[];
  @ApiPropertyOptional({ type: [GuideScheduleDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GuideScheduleDto) schedules?: GuideScheduleDto[];
}

export class UpdateTourGuideDto extends PartialType(CreateTourGuideDto) {}
