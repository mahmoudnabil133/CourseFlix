import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLogEntity } from '../../agent-logs/entities/agent-log.entity';
import { ListAdminAgentLogsQueryDto } from '../dto/list-admin-agent-logs-query.dto';

export interface AdminAgentLogListItem {
  id: string;
  agentType: AgentLogEntity['agentType'];
  courseId: string | null;
  action: string;
  status: AgentLogEntity['status'];
  tokensUsed: number | null;
  durationMs: number | null;
  correlationId: string | null;
  errorMessage: string | null;
  executedAt: string;
}

const MAX_RESULTS = 200;

// Read + delete only, no edit — these are immutable audit records.
// AgentLogEntity has no soft-delete column, so delete here is a real
// DELETE; the table is a pure log leaf with no dependents.
@Injectable()
export class AdminAgentLogsService {
  constructor(
    @InjectRepository(AgentLogEntity)
    private readonly agentLogsRepository: Repository<AgentLogEntity>,
  ) {}

  async listAgentLogs(
    query: ListAdminAgentLogsQueryDto,
  ): Promise<AdminAgentLogListItem[]> {
    const where: Record<string, unknown> = {};
    if (query.agentType) where.agentType = query.agentType;
    if (query.status) where.status = query.status;
    if (query.courseId) where.courseId = query.courseId;

    const logs = await this.agentLogsRepository.find({
      where,
      order: { executedAt: 'DESC' },
      take: MAX_RESULTS,
    });

    return logs.map((log) => ({
      id: log.id,
      agentType: log.agentType,
      courseId: log.courseId,
      action: log.action,
      status: log.status,
      tokensUsed: log.tokensUsed,
      durationMs: log.durationMs,
      correlationId: log.correlationId,
      errorMessage: log.errorMessage,
      executedAt: log.executedAt.toISOString(),
    }));
  }

  async deleteAgentLog(agentLogId: string): Promise<void> {
    const result = await this.agentLogsRepository.delete(agentLogId);
    if (result.affected === 0) {
      throw new NotFoundException('Agent log not found.');
    }
  }
}
