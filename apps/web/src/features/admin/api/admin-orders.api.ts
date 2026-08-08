import { httpClient } from '../../../shared/api/http-client'
import type { AdminOrderDetail, AdminOrderListItem, AdminOrdersFilter } from '../types/admin.types'

export async function getAdminOrders(
  filters: AdminOrdersFilter = {},
): Promise<AdminOrderListItem[]> {
  return httpClient.get<AdminOrderListItem[]>('/admin/orders', { searchParams: filters })
}

export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDetail> {
  return httpClient.get<AdminOrderDetail>(`/admin/orders/${orderId}`)
}
