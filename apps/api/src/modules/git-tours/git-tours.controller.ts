import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { RequestUser } from '../auth/data-scope';
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
  list(@Query('search') search?: string, @Query('status') status?: TourStatus, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.list(search, status, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateGitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateGitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.update(id, dto, request?.user);
  }

  @Patch(':id')
  @RequirePermissions('tour.manage')
  patch(@Param('id') id: string, @Body() dto: UpdateGitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.remove(id, request?.user);
  }

  @Post(':id/copy-services')
  @RequirePermissions('tour.manage')
  copyServices(@Param('id') id: string, @Body('sourceTourId') sourceTourId: string | undefined, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.copyServices(id, sourceTourId, request?.user);
  }
}
