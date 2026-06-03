import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateTourGuideDto, UpdateTourGuideDto } from './dto/tour-guide.dto';
import { TourGuidesService } from './tour-guides.service';

@ApiTags('tour-guides')
@RequirePermissions('guide.view')
@Controller('tour-guides')
export class TourGuidesController {
  constructor(private readonly service: TourGuidesService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string) {
    return this.service.list(search, status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
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
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
