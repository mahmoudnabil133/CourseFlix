import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminOrdersService } from '../services/admin-orders.service';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';

// Read-only — see AdminOrdersService's docblock for why orders/payments
// have no admin-mutable endpoints.
@Controller('api/v1/admin/orders')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  listOrders(@Query() query: ListOrdersQueryDto) {
    return this.adminOrdersService.listOrders(query);
  }

  @Get(':orderId')
  getOrderDetail(@Param('orderId') orderId: string) {
    return this.adminOrdersService.getOrderDetail(orderId);
  }
}
