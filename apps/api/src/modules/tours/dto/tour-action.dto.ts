import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CloseTourDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
