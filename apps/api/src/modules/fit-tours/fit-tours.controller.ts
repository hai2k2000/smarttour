import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
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
  list(@Query('search') search?: string, @Query('status') status?: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.list(search, status, request?.user);
  }

  @Post('import')
  @RequirePermissions('tour.manage')
  import(@Body() dto: CreateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.create(dto, request?.user);
  }

  @Post('export')
  export(@Body('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.detail(id, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('tour.manage')
  create(@Body() dto: CreateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.create(dto, request?.user);
  }

  @Put(':id')
  @RequirePermissions('tour.manage')
  update(@Param('id') id: string, @Body() dto: UpdateFitTourDto, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.remove(id, request?.user);
  }

  @Post(':id/copy-budget')
  @RequirePermissions('tour.manage')
  copyBudget(@Param('id') id: string, @Body('sourceTourId') sourceTourId: string | undefined, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.copyBudget(id, sourceTourId, request?.user);
  }

  @Post(':id/copy-operation')
  @RequirePermissions('tour.manage')
  copyOperation(@Param('id') id: string, @Body('sourceTourId') sourceTourId: string | undefined, @Req() request?: { user?: RequestUser }) {
    return this.fitToursService.copyOperation(id, sourceTourId, request?.user);
  }
}
