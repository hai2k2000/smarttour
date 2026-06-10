import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LandTourCopyServicesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTourId?: string;
}
