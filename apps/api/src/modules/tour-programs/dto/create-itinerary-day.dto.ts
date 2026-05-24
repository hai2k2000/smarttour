import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateItineraryDayDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  dayNumber!: number;

  @ApiProperty({ example: 'Ha Noi - Ha Long' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
