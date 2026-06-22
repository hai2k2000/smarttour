import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateGitTourDto } from './dto/create-git-tour.dto';
import { GitTourCopyServicesDto } from './dto/git-tour-action.dto';
import { ListGitToursQueryDto } from './dto/list-git-tours-query.dto';
import { UpdateGitTourDto } from './dto/update-git-tour.dto';
import { GitToursService } from './git-tours.service';

@ApiTags('git-tours')
@RequirePermissions('tour.view')
@Controller('git-tours')
export class GitToursController {
  constructor(private readonly gitToursService: GitToursService) {}

  @Get()
  list(@Query() query: ListGitToursQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.list(query, request?.user);
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
  copyServices(@Param('id') id: string, @Body() dto: GitTourCopyServicesDto = {}, @Req() request?: { user?: RequestUser }) {
    return this.gitToursService.copyServices(id, dto.sourceTourId, request?.user);
  }
}
