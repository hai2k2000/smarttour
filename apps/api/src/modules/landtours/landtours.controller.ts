import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateLandTourDto } from './dto/create-landtour.dto';
import { UpdateLandTourDto } from './dto/update-landtour.dto';
import { LandToursService } from './landtours.service';

@ApiTags('landtours')
@RequirePermissions('tour.view')
@Controller('landtours')
export class LandToursController {
  constructor(private readonly landToursService: LandToursService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: TourStatus) {
    return this.landToursService.list(search, status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.landToursService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateLandTourDto) {
    return this.landToursService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateLandTourDto) {
    return this.landToursService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.landToursService.remove(id);
  }

  @Post(':id/copy-services')
  @RequirePermissions('tour.manage')
  copyServices(@Param('id') id: string, @Body('sourceTourId') sourceTourId?: string) {
    return this.landToursService.copyServices(id, sourceTourId);
  }
}
