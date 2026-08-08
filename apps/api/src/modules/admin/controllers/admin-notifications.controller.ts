import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { ListAdminNotificationsQueryDto } from '../dto/list-admin-notifications-query.dto';
import { SendAdminNotificationDto } from '../dto/send-admin-notification.dto';

@Controller('api/v1/admin/notifications-log')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminNotificationsController {
  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  @Get()
  listNotifications(@Query() query: ListAdminNotificationsQueryDto) {
    return this.adminNotificationsService.listNotifications(query);
  }

  // NO_CONTENT, not CREATED — this returns no body, and the frontend's
  // parseResponse only special-cases 204 to skip response.json(); a 201
  // with an empty body made it throw a raw SyntaxError instead of a real
  // ApiError, which is why the UI only ever showed the generic fallback
  // message. Same convention as every other void-returning endpoint here.
  @Post('send')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendNotification(@Body() dto: SendAdminNotificationDto) {
    await this.adminNotificationsService.sendNotification(dto);
  }

  @Delete(':notificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(@Param('notificationId') notificationId: string) {
    await this.adminNotificationsService.deleteNotification(notificationId);
  }
}
