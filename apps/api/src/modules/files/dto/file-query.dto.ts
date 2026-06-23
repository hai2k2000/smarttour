import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class FileUploadBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;
}

export class FileObjectKeyQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  key!: string;
}
