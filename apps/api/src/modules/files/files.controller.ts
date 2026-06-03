import { BadRequestException, Body, Controller, Delete, Get, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermissions } from '../auth/permissions.decorator';
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
    @Body('scope') scope: string | undefined,
    @Req() request: { user?: { id?: string } },
  ) {
    if (!file) throw new BadRequestException('Cần chọn file để tải lên');
    return this.filesService.upload(file, scope, request.user?.id);
  }

  @Get('download')
  @RequirePermissions('file.view')
  async download(@Query('key') key: string | undefined, @Res() response: any) {
    const file = await this.filesService.download(key);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.pipe(response);
  }

  @Delete()
  @RequirePermissions('file.manage')
  remove(@Query('key') key: string | undefined) {
    return this.filesService.remove(key);
  }
}
