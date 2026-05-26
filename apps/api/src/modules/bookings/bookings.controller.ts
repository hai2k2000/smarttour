import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@RequirePermissions('booking.view')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: BookingStatus, @Query('tourProgramId') tourProgramId?: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.list(search, status, tourProgramId, request?.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.detail(id, request?.user);
  }

  @Post()
  @RequirePermissions('booking.manage')
  create(@Body() dto: CreateBookingDto) {
    return this.bookingsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('booking.manage')
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.update(id, dto, request?.user);
  }

  @Delete(':id')
  @RequirePermissions('booking.manage')
  remove(@Param('id') id: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.remove(id, request?.user);
  }
}
