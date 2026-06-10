import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FitTourWorkflowStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class FitTourExportDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  id!: string;
}

export class FitTourCopySourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTourId?: string;
}

export class FitTourAttachmentUploadDto {
  @ApiPropertyOptional({ enum: FitTourWorkflowStatus })
  @IsOptional()
  @IsEnum(FitTourWorkflowStatus)
  step?: FitTourWorkflowStatus;
}
