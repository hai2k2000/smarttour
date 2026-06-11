import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierCategoryDto {
  @ApiProperty({ example: 'Khách sạn' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Tên loại nhà cung cấp phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên loại nhà cung cấp phải có ít nhất 2 ký tự' })
  @MaxLength(120, { message: 'Tên loại nhà cung cấp không được vượt quá 120 ký tự' })
  name!: string;
}
