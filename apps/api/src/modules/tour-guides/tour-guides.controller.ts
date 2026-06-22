import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateTourGuideDto, ListTourGuidesQueryDto, UpdateTourGuideDto } from './dto/tour-guide.dto';
import { TourGuidesService } from './tour-guides.service';

@ApiTags('tour-guides')
@RequirePermissions('guide.view')
@Controller('tour-guides')
export class TourGuidesController {
  constructor(private readonly service: TourGuidesService) {}

  @Get()
  list(@Query() query: ListTourGuidesQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.service.list(query, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.detail(id, request?.user);
  }

  @Post(':id/files')
  @RequirePermissions('guide.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  addFile(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() request: { user?: RequestUser },
  ) {
    return this.service.addFile(id, file, request.user);
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('guide.manage')
  removeFile(@Param('id') id: string, @Param('fileId') fileId: string, @Req() request?: { user?: RequestUser }) {
    return this.service.deleteFile(id, fileId, request?.user);
  }

  @Post()
  @RequirePermissions('guide.manage')
  create(@Body() dto: CreateTourGuideDto, @Req() request?: { user?: RequestUser }) {
    return this.service.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('guide.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTourGuideDto, @Req() request?: { user?: RequestUser }) {
    return this.service.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('guide.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.service.remove(id, request?.user);
  }
}
