import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@Controller('api/v1/admin/analytics')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.adminAnalyticsService.getOverview();
  }
}
