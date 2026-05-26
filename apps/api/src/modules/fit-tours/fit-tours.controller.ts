import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateFitTourDto } from './dto/create-fit-tour.dto';
import { UpdateFitTourDto } from './dto/update-fit-tour.dto';
import { FitToursService } from './fit-tours.service';

@ApiTags('fit-tours')
@RequirePermissions('tour.view')
@Controller('fit-tours')
export class FitToursController {
  constructor(private readonly fitToursService: FitToursService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string) {
    return this.fitToursService.list(search, status);
  }

  @Post('import')
  @RequirePermissions('tour.manage')
  import(@Body() dto: CreateFitTourDto) {
    return this.fitToursService.create(dto);
  }

  @Post('export')
  export(@Body('id') id: string) {
    return this.fitToursService.detail(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.fitToursService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateFitTourDto) {
    return this.fitToursService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateFitTourDto) {
    return this.fitToursService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string) {
    return this.fitToursService.remove(id);
  }

  @Post(':id/copy-budget')
  @RequirePermissions('tour.manage')
  copyBudget(@Param('id') id: string, @Body('sourceTourId') sourceTourId?: string) {
    return this.fitToursService.copyBudget(id, sourceTourId);
  }

  @Post(':id/copy-operation')
  @RequirePermissions('tour.manage')
  copyOperation(@Param('id') id: string, @Body('sourceTourId') sourceTourId?: string) {
    return this.fitToursService.copyOperation(id, sourceTourId);
  }
}
