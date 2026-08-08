import { httpClient } from '../../../shared/api/http-client'
import type {
  AdminInterventionListItem,
  AdminInterventionsFilter,
  InterventionStatus,
} from '../types/admin.types'

export async function getAdminInterventions(
  filters: AdminInterventionsFilter = {},
): Promise<AdminInterventionListItem[]> {
  return httpClient.get<AdminInterventionListItem[]>('/admin/interventions', {
    searchParams: filters,
  })
}

export async function updateAdminInterventionStatus(
  interventionId: string,
  status: InterventionStatus,
): Promise<void> {
  await httpClient.patch(`/admin/interventions/${interventionId}/status`, { status })
}

export async function deleteAdminIntervention(interventionId: string): Promise<void> {
  await httpClient.delete(`/admin/interventions/${interventionId}`)
}
