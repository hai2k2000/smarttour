import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GitTourCopyServicesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTourId?: string;
}
