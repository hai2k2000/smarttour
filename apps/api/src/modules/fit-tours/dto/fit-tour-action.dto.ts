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
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sourceTourId!: string;
}

export class FitTourCopyOperationDto {
  @ApiPropertyOptional({ description: 'Bỏ trống để sao chép dự toán của chính tour đích sang điều hành.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceTourId?: string;
}

export class FitTourAttachmentUploadDto {
  @ApiPropertyOptional({ enum: FitTourWorkflowStatus })
  @IsOptional()
  @IsEnum(FitTourWorkflowStatus)
  step?: FitTourWorkflowStatus;
}
