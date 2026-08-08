import { httpClient } from '../../../shared/api/http-client'
import type { AdminAnalyticsOverview } from '../types/admin.types'

export async function getAdminAnalyticsOverview(): Promise<AdminAnalyticsOverview> {
  return httpClient.get<AdminAnalyticsOverview>('/admin/analytics/overview')
}
