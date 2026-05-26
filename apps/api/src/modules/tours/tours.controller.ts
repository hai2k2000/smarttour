import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus, TourType } from '@prisma/client';
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
  list(@Query('search') search?: string, @Query('type') type?: TourType, @Query('status') status?: TourStatus) {
    return this.toursService.list(search, type, status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.toursService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateTourDto) {
    return this.toursService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTourDto) {
    return this.toursService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.toursService.remove(id);
  }
}
