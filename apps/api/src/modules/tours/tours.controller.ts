import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus, TourType } from '@prisma/client';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { ToursService } from './tours.service';

@ApiTags('tours')
@RequirePermissions('tour.view')
@Controller('tours')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Get()
  list(@Query('search') search?: string, @Query('type') type?: TourType, @Query('status') status?: TourStatus, @Req() request?: { user?: RequestUser }) {
    return this.toursService.list(search, type, status, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.toursService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateTourDto, @Req() request?: { user?: RequestUser }) {
    return this.toursService.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTourDto, @Req() request?: { user?: RequestUser }) {
    return this.toursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.toursService.remove(id, request?.user);
  }

  @Post(':id/close')
  @RequirePermissions('tour.manage')
  close(@Param('id') id: string, @Body() dto: { note?: string }, @Req() request?: { user?: RequestUser }) {
    return this.toursService.close(id, dto, request?.user);
  }
}
