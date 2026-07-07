import { BadRequestException, Body, Controller, Delete, Get, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ServerResponse } from 'node:http';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { FileObjectKeyQueryDto, FileUploadBodyDto } from './dto/file-query.dto';
import { fileUploadInterceptorOptions, FilesService } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @RequirePermissions('file.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', fileUploadInterceptorOptions()))
  upload(
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Body() dto: FileUploadBodyDto,
    @Req() request: { user?: RequestUser },
  ) {
    if (!file) throw new BadRequestException('Cần chọn file để tải lên');
    return this.filesService.uploadAuthorized(file, dto.scope, request.user);
  }

  @Get('download')
  @RequirePermissions('file.view')
  async download(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }, @Res() response: ServerResponse) {
    const key = query.key;
    const file = await this.filesService.downloadAuthorized(key, request.user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.pipe(response);
  }

  @Delete()
  @RequirePermissions('file.manage')
  remove(@Query() query: FileObjectKeyQueryDto, @Req() request: { user?: RequestUser }) {
    const key = query.key;
    return this.filesService.removeAuthorized(key, request.user);
  }
}
