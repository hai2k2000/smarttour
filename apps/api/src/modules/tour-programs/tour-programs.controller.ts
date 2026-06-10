import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto';
import { CreateTourProgramDto } from './dto/create-tour-program.dto';
import { ListTourProgramsQueryDto } from './dto/list-tour-programs-query.dto';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto';
import { UpdateTourProgramDto } from './dto/update-tour-program.dto';
import { TourProgramsService } from './tour-programs.service';

@ApiTags('tour-programs')
@RequirePermissions('tour.view')
@Controller('tour-programs')
export class TourProgramsController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tour mẫu', description: 'Hỗ trợ tìm kiếm theo mã, tên hoặc tuyến điểm.' })
  list(@Query() query: ListTourProgramsQueryDto) {
    return this.tourProgramsService.list(query.search);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết tour mẫu',
    description: 'Trả thông tin tour mẫu cùng danh sách itineraryDays đã sắp xếp theo số ngày.',
  })
  @ApiParam({ name: 'id', description: 'ID tour mẫu' })
  detail(@Param('id') id: string) {
    return this.tourProgramsService.detail(id);
  }

  @Post()
  @RequirePermissions('tour.manage')
  @ApiOperation({ summary: 'Tạo tour mẫu' })
  create(@Body() dto: CreateTourProgramDto) {
    return this.tourProgramsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tour.manage')
  @ApiOperation({ summary: 'Cập nhật một phần tour mẫu', description: 'Chỉ cập nhật các field được gửi lên; field không gửi được giữ nguyên.' })
  @ApiParam({ name: 'id', description: 'ID tour mẫu' })
  update(@Param('id') id: string, @Body() dto: UpdateTourProgramDto) {
    return this.tourProgramsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  @ApiOperation({ summary: 'Xóa tour mẫu' })
  @ApiParam({ name: 'id', description: 'ID tour mẫu' })
  remove(@Param('id') id: string) {
    return this.tourProgramsService.remove(id);
  }

  @Post(':id/itinerary-days')
  @RequirePermissions('tour.manage')
  @ApiOperation({
    summary: 'Tạo ngày lịch trình cho tour mẫu',
    description: 'Ngày lịch trình luôn thuộc tour program được xác định bởi tham số id, không được tạo độc lập.',
  })
  @ApiParam({ name: 'id', description: 'ID tour mẫu sở hữu ngày lịch trình' })
  createItineraryDay(@Param('id') id: string, @Body() dto: CreateItineraryDayDto) {
    return this.tourProgramsService.createItineraryDay(id, dto);
  }
}

@ApiTags('tour-itinerary-days')
@RequirePermissions('tour.view')
@Controller('tour-itinerary-days')
export class TourItineraryDaysController {
  constructor(private readonly tourProgramsService: TourProgramsService) {}

  @Patch(':id')
  @RequirePermissions('tour.manage')
  @ApiOperation({
    summary: 'Cập nhật một phần ngày lịch trình',
    description: 'Cập nhật sub-resource ngày lịch trình đã thuộc một tour mẫu; không thay đổi tour program sở hữu.',
  })
  @ApiParam({ name: 'id', description: 'ID ngày lịch trình' })
  update(@Param('id') id: string, @Body() dto: UpdateItineraryDayDto) {
    return this.tourProgramsService.updateItineraryDay(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tour.manage')
  @ApiOperation({
    summary: 'Xóa ngày lịch trình',
    description: 'Xóa sub-resource ngày lịch trình khỏi tour mẫu sở hữu nếu không có dữ liệu điều hành liên quan.',
  })
  @ApiParam({ name: 'id', description: 'ID ngày lịch trình' })
  remove(@Param('id') id: string) {
    return this.tourProgramsService.removeItineraryDay(id);
  }
}
