import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminAgentLogsService } from '../services/admin-agent-logs.service';
import { ListAdminAgentLogsQueryDto } from '../dto/list-admin-agent-logs-query.dto';

@Controller('api/v1/admin/agent-logs')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminAgentLogsController {
  constructor(private readonly adminAgentLogsService: AdminAgentLogsService) {}

  @Get()
  listAgentLogs(@Query() query: ListAdminAgentLogsQueryDto) {
    return this.adminAgentLogsService.listAgentLogs(query);
  }

  @Delete(':agentLogId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAgentLog(@Param('agentLogId') agentLogId: string) {
    await this.adminAgentLogsService.deleteAgentLog(agentLogId);
  }
}
