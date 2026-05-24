import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateTourProgramDto {
  @ApiProperty({ example: 'HL-3N2D' })
  @IsString()
  @MinLength(2)
  code!: string;

  @ApiProperty({ example: 'Ha Long 3 ngay 2 dem' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Ha Noi - Ha Long - Ninh Binh' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
