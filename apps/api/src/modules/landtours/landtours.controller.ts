import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TourStatus } from '@prisma/client';
import { RequestUser } from '../auth/data-scope';
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
  list(@Query('search') search?: string, @Query('status') status?: TourStatus, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.list(search, status, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateLandTourDto, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateLandTourDto, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.remove(id, request?.user);
  }

  @Post(':id/copy-services')
  @RequirePermissions('tour.manage')
  copyServices(@Param('id') id: string, @Body('sourceTourId') sourceTourId: string | undefined, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.copyServices(id, sourceTourId, request?.user);
  }
}
