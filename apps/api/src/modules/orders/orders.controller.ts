import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestUser } from '../auth/data-scope';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateOrderDto, ListOrdersQueryDto, UnlockOrderDto, UpdateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('hotel-service-options')
  @RequirePermissions('order.view')
  hotelServiceOptions() {
    return this.ordersService.hotelServiceOptions();
  }

  @Get(':type')
  @RequirePermissions('order.view')
  list(@Param('type') type: string, @Query() query: ListOrdersQueryDto, @Req() request: { user?: RequestUser }) {
    return this.ordersService.list(type, query, request.user);
  }

  @Get(':type/:id/document')
  @RequirePermissions('order.view', 'order.export')
  document(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.document(type, id, request.user);
  }

  @Get(':type/:id')
  @RequirePermissions('order.view')
  detail(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.detail(type, id, request.user);
  }

  @Post(':type')
  @RequirePermissions('order.manage')
  create(@Param('type') type: string, @Body() dto: CreateOrderDto, @Req() request: { user?: RequestUser }) {
    return this.ordersService.create(type, dto, request.user);
  }

  @Put(':type/:id')
  @RequirePermissions('order.manage')
  update(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateOrderDto, @Req() request: { user?: RequestUser }) {
    return this.ordersService.update(type, id, dto, request.user);
  }

  @Delete(':type/:id')
  @RequirePermissions('order.manage')
  remove(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.remove(type, id, request.user);
  }

  @Patch(':type/:id/status')
  @HttpCode(200)
  @RequirePermissions('order.status.update')
  updateStatus(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @Req() request: { user?: RequestUser }) {
    return this.ordersService.updateStatus(type, id, dto.status, request.user);
  }

  @Post(':type/:id/copy')
  @RequirePermissions('order.manage')
  copy(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.copy(type, id, request.user);
  }

  @Post(':type/:id/settle')
  @HttpCode(200)
  @RequirePermissions('order.settle')
  settle(@Param('type') type: string, @Param('id') id: string, @Req() request: { user?: RequestUser }) {
    return this.ordersService.settle(type, id, request.user);
  }

  @Post(':type/:id/unlock')
  @HttpCode(200)
  @RequirePermissions('order.unlock')
  unlock(@Param('type') type: string, @Param('id') id: string, @Body() dto: UnlockOrderDto, @Req() request: { user?: RequestUser }) {
    return this.ordersService.unlock(type, id, dto, request.user);
  }
}
