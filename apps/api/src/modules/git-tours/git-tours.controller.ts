import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateGitTourDto } from './dto/create-git-tour.dto';
import { UpdateGitTourDto } from './dto/update-git-tour.dto';
import { GitToursService } from './git-tours.service';

@ApiTags('git-tours')
@RequirePermissions('tour.view')
@Controller('git-tours')
export class GitToursController {
  constructor(private readonly gitToursService: GitToursService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: TourStatus) {
    return this.gitToursService.list(search, status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.gitToursService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateGitTourDto) {
    return this.gitToursService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateGitTourDto) {
    return this.gitToursService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.gitToursService.remove(id);
  }

  @Post(':id/copy-services')
  @RequirePermissions('tour.manage')
  copyServices(@Param('id') id: string, @Body('sourceTourId') sourceTourId?: string) {
    return this.gitToursService.copyServices(id, sourceTourId);
  }
}
