import { Allow, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class SupplierImportDto {
  @IsOptional()
  @IsArray()
  @Allow()
  rows?: unknown[];

  @IsOptional()
  @IsString()
  csv?: string;

  @IsOptional()
  @IsIn(['create'])
  mode?: 'create';
}
