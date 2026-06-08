import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, UpdateBookingStatusDto } from './dto/update-booking.dto';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@RequirePermissions('booking.view')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('status') status?: string, @Query('tourProgramId') tourProgramId?: string, @Req() request?: { user?: RequestUser }) {
    return this.bookingsService.list(search, status, tourProgramId, request?.user);
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
    @Body('status') status: unknown,
    @Req() request?: { user?: RequestUser },
  ) {
    if (status !== undefined) {
      throw new BadRequestException('Dùng PATCH /api/bookings/:id/status để cập nhật trạng thái booking');
    }
    return this.bookingsService.update(id, dto, request?.user);
  }

  @Patch(':id/status')
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
