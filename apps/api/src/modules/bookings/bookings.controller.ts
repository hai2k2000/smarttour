import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingDto, UpdateBookingStatusDto } from './dto/update-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@RequirePermissions('booking.view')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@Query() query: ListBookingsQueryDto, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.list(query.search, query.status, query.tourProgramId, request?.user, query.take ?? query.limit, query.skip);
  }

  @Get(':id/delete-guard')
  @RequirePermissions('booking.manage')
  deleteGuard(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.deleteGuard(id, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('booking.manage')
  create(@Body() dto: CreateBookingDto, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.create(dto, request?.user);
  }

  @Patch(':id')
  @RequirePermissions('booking.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
    @Req() request?: { user?: RequestUser },
  ) {
    return this.bookingsService.update(id, dto, request?.user);
  }

  @Patch(':id/status')
  @HttpCode(200)
  @RequirePermissions('booking.manage')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateBookingStatusDto, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.updateStatus(id, dto.status, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('booking.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.remove(id, request?.user);
  }
}
