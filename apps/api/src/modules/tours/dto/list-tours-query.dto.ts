import { ApiPropertyOptional } from '@nestjs/swagger';
import { TourStatus, TourType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListToursQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TourType })
  @IsOptional()
  @IsEnum(TourType)
  type?: TourType;

  @ApiPropertyOptional({ enum: TourStatus })
  @IsOptional()
  @IsEnum(TourStatus)
  status?: TourStatus;
}
