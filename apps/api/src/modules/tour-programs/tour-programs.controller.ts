import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { CreateTourProgramDto } from './dto/create-tour-program.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
import { UpdateTourProgramDto } from './dto/update-tour-program.dto';
import { TourProgramsService } from './tour-programs.service';

@ApiTags('tour-programs')
@RequirePermissions('tour.view')
@Controller('tour-programs')
export class TourProgramsController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Get()
  list(@Query('search') search?: unknown) {
    return this.tourProgramsService.list(this.searchQuery(search));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tourProgramsService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateTourProgramDto) {
    return this.tourProgramsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateTourProgramDto) {
    return this.tourProgramsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.tourProgramsService.remove(id);
  }

  @Post(':id/itinerary-days')
  @RequirePermissions('tour.manage')
  createItineraryDay(@Param('id') id: string, @Body() dto: CreateItineraryDayDto) {
    return this.tourProgramsService.createItineraryDay(id, dto);
  }

  private searchQuery(search: unknown) {
    if (search === undefined || search === null) return undefined;
    if (typeof search !== 'string') throw new BadRequestException('Từ khóa tìm kiếm phải là chuỗi ký tự');
    return search.trim();
  }
}

@ApiTags('tour-itinerary-days')
@RequirePermissions('tour.view')
@Controller('tour-itinerary-days')
export class TourItineraryDaysController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Patch(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateItineraryDayDto) {
    return this.tourProgramsService.updateItineraryDay(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.tourProgramsService.removeItineraryDay(id);
  }
}
