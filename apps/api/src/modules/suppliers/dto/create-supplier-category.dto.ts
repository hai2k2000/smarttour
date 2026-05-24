import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateSupplierCategoryDto {
  @ApiProperty({ example: 'Hotel' })
  @IsString()
  @MinLength(2)
  name!: string;
}
