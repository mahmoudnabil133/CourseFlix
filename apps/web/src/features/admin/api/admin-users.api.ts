import { httpClient } from '../../../shared/api/http-client'
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUsersFilter,
  CreateAdminAccountPayload,
  UpdateAdminUserPayload,
  UserStatus,
} from '../types/admin.types'
import type { UserRole } from '../../auth/types/auth.types'

export async function getAdminUsers(
  filters: AdminUsersFilter = {},
): Promise<AdminUserListItem[]> {
  return httpClient.get<AdminUserListItem[]>('/admin/users', { searchParams: filters })
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return httpClient.get<AdminUserDetail>(`/admin/users/${userId}`)
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUserPayload,
): Promise<AdminUserDetail> {
  return httpClient.patch<AdminUserDetail>(`/admin/users/${userId}`, payload)
}

export async function updateAdminUserRole(
  userId: string,
  role: UserRole,
): Promise<AdminUserDetail> {
  return httpClient.patch<AdminUserDetail>(`/admin/users/${userId}/role`, { role })
}

export async function updateAdminUserStatus(
  userId: string,
  status: UserStatus,
): Promise<AdminUserDetail> {
  return httpClient.patch<AdminUserDetail>(`/admin/users/${userId}/status`, { status })
}

export async function softDeleteAdminUser(userId: string): Promise<void> {
  await httpClient.delete(`/admin/users/${userId}`)
}

export async function hardDeleteAdminUser(userId: string): Promise<void> {
  await httpClient.delete(`/admin/users/${userId}/hard`)
}

export async function createAdminAccount(
  payload: CreateAdminAccountPayload,
): Promise<AdminUserDetail> {
  return httpClient.post<AdminUserDetail>('/admin/users/admins', payload)
}
