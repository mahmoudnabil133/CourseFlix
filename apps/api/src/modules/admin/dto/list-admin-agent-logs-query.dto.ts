import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListAdminAgentLogsQueryDto {
  @IsOptional()
  @IsIn(['content_scout', 'proactive_proctor', 'tutor_llm', 'analytics_agent'])
  agentType?: string;

  @IsOptional()
  @IsIn(['success', 'failed', 'retrying', 'skipped'])
  status?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}
