import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import {
  SupplierChildServiceInputDto,
  SupplierContactInputDto,
  UpdateGenericSupplierDto,
} from './generic-supplier.dto';
import {
  SupplierAllotmentInputDto,
  SupplierServiceInputDto,
  UpdateHotelSupplierDto,
} from './hotel-supplier.dto';

export class UpdateGenericSupplierRootDto extends OmitType(
  UpdateGenericSupplierDto,
  ['contacts', 'services'] as const,
) {}

export class UpdateHotelSupplierRootDto extends OmitType(
  UpdateHotelSupplierDto,
  ['contacts', 'services', 'allotments'] as const,
) {}

export class SupplierBatchContactDto extends SupplierContactInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID liên hệ nhà cung cấp không hợp lệ' })
  id?: string;
}

export class SupplierBatchGenericServiceDto extends SupplierChildServiceInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID dịch vụ nhà cung cấp không hợp lệ' })
  id?: string;
}

export class SupplierBatchHotelServiceDto extends SupplierServiceInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID dịch vụ khách sạn không hợp lệ' })
  id?: string;
}

export class SupplierBatchAllotmentDto extends SupplierAllotmentInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'ID quỹ phòng không hợp lệ' })
  id?: string;
}

export class UpdateGenericSupplierBatchDto {
  @ApiProperty({ type: UpdateGenericSupplierRootDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateGenericSupplierRootDto)
  root!: UpdateGenericSupplierRootDto;

  @ApiPropertyOptional({ type: [SupplierBatchContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchContactDto)
  contacts?: SupplierBatchContactDto[];

  @ApiPropertyOptional({ type: [SupplierBatchGenericServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchGenericServiceDto)
  services?: SupplierBatchGenericServiceDto[];
}

export class UpdateHotelSupplierBatchDto {
  @ApiProperty({ type: UpdateHotelSupplierRootDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateHotelSupplierRootDto)
  root!: UpdateHotelSupplierRootDto;

  @ApiPropertyOptional({ type: [SupplierBatchContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchContactDto)
  contacts?: SupplierBatchContactDto[];

  @ApiPropertyOptional({ type: [SupplierBatchHotelServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchHotelServiceDto)
  services?: SupplierBatchHotelServiceDto[];

  @ApiPropertyOptional({ type: [SupplierBatchAllotmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierBatchAllotmentDto)
  allotments?: SupplierBatchAllotmentDto[];
}
