import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { CreateTourProgramDto } from './dto/create-tour-program.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
import { UpdateTourProgramDto } from './dto/update-tour-program.dto';
import { TourProgramsService } from './tour-programs.service';

@ApiTags('tour-programs')
@Controller('tour-programs')
export class TourProgramsController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.tourProgramsService.list(search);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tourProgramsService.detail(id);
  }

  @Post()
  create(@Body() dto: CreateTourProgramDto) {
    return this.tourProgramsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTourProgramDto) {
    return this.tourProgramsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tourProgramsService.remove(id);
  }

  @Post(':id/itinerary-days')
  createItineraryDay(@Param('id') id: string, @Body() dto: CreateItineraryDayDto) {
    return this.tourProgramsService.createItineraryDay(id, dto);
  }
}

@ApiTags('tour-itinerary-days')
@Controller('tour-itinerary-days')
export class TourItineraryDaysController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateItineraryDayDto) {
    return this.tourProgramsService.updateItineraryDay(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tourProgramsService.removeItineraryDay(id);
  }
}
