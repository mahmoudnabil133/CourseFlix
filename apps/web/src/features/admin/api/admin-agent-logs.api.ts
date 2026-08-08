import { httpClient } from '../../../shared/api/http-client'
import type { AdminAgentLogListItem, AdminAgentLogsFilter } from '../types/admin.types'

export async function getAdminAgentLogs(
  filters: AdminAgentLogsFilter = {},
): Promise<AdminAgentLogListItem[]> {
  return httpClient.get<AdminAgentLogListItem[]>('/admin/agent-logs', { searchParams: filters })
}

export async function deleteAdminAgentLog(agentLogId: string): Promise<void> {
  await httpClient.delete(`/admin/agent-logs/${agentLogId}`)
}
