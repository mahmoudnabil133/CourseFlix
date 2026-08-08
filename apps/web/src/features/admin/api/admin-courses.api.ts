import { httpClient } from '../../../shared/api/http-client'
import type {
  AdminCourseListItem,
  AdminCoursesFilter,
  UpdateAdminCoursePayload,
} from '../types/admin.types'
import type { CourseDetail } from '../../courses/types/course.types'

export async function getAdminCourses(
  filters: AdminCoursesFilter = {},
): Promise<AdminCourseListItem[]> {
  return httpClient.get<AdminCourseListItem[]>('/admin/courses', { searchParams: filters })
}

export async function getAdminCourseDetail(courseId: string): Promise<CourseDetail> {
  return httpClient.get<CourseDetail>(`/admin/courses/${courseId}`)
}

export async function updateAdminCourse(
  courseId: string,
  payload: UpdateAdminCoursePayload,
): Promise<CourseDetail> {
  return httpClient.patch<CourseDetail>(`/admin/courses/${courseId}`, payload)
}

export async function deleteAdminCourse(courseId: string): Promise<void> {
  await httpClient.delete(`/admin/courses/${courseId}`)
}
