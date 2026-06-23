import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateLandTourDto } from './dto/create-landtour.dto';
import { LandTourCopyServicesDto } from './dto/landtour-action.dto';
import { ListLandToursQueryDto } from './dto/list-landtours-query.dto';
import { UpdateLandTourDto } from './dto/update-landtour.dto';
import { LandToursService } from './landtours.service';

@ApiTags('landtours')
@RequirePermissions('tour.view')
@Controller('landtours')
export class LandToursController {
  constructor(private readonly landToursService: LandToursService) {}

  @Get()
  list(@Query() query: ListLandToursQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.list(query, request?.user);
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

  @Patch(':id')
  @RequirePermissions('tour.manage')
  patch(@Param('id') id: string, @Body() dto: UpdateLandTourDto, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.remove(id, request?.user);
  }

  @Post(':id/copy-services')
  @HttpCode(200)
  @RequirePermissions('tour.manage')
  copyServices(@Param('id') id: string, @Body() dto: LandTourCopyServicesDto = {}, @Req() request?: { user?: RequestUser }) {
    return this.landToursService.copyServices(id, dto.sourceTourId, request?.user);
  }
}
