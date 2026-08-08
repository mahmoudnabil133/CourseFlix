import { httpClient } from '../../../shared/api/http-client'
import type {
  CreateLessonPayload,
  CreateSectionPayload,
  CreateTeacherCoursePayload,
  TeacherCourse,
  TeacherDashboard,
  TeacherLesson,
  TeacherSection,
  TeacherStudentsResponse,
  UpdateLessonPayload,
  UpdateSectionPayload,
  UpdateTeacherCoursePayload,
} from '../types/teacher.types'

export async function getTeacherDashboard(): Promise<TeacherDashboard> {
  return httpClient.get<TeacherDashboard>('/teacher/dashboard')
}

export async function getTeacherCourses(filters: { status?: string } = {}): Promise<TeacherCourse[]> {
  return httpClient.get<TeacherCourse[]>('/teacher/courses', { searchParams: filters })
}

export async function getTeacherStudents(
  filters: { studentId?: string } = {},
): Promise<TeacherStudentsResponse> {
  return httpClient.get<TeacherStudentsResponse>('/teacher/students', {
    searchParams: filters,
  })
}

export async function createTeacherCourse(
  payload: CreateTeacherCoursePayload,
): Promise<TeacherCourse> {
  return httpClient.post<TeacherCourse>('/teacher/courses', payload)
}

export async function updateTeacherCourse(
  courseId: string,
  payload: UpdateTeacherCoursePayload,
): Promise<TeacherCourse> {
  return httpClient.patch<TeacherCourse>(`/teacher/courses/${courseId}`, payload)
}

export async function deleteTeacherCourse(courseId: string): Promise<void> {
  await httpClient.delete(`/teacher/courses/${courseId}`)
}

export async function createSection(
  courseId: string,
  payload: CreateSectionPayload,
): Promise<TeacherSection> {
  return httpClient.post<TeacherSection>(`/teacher/courses/${courseId}/sections`, payload)
}

export async function updateSection(
  sectionId: string,
  payload: UpdateSectionPayload,
): Promise<TeacherSection> {
  return httpClient.patch<TeacherSection>(`/teacher/sections/${sectionId}`, payload)
}

export async function deleteSection(sectionId: string): Promise<void> {
  await httpClient.delete(`/teacher/sections/${sectionId}`)
}

export async function createLesson(
  sectionId: string,
  payload: CreateLessonPayload,
): Promise<TeacherLesson> {
  return httpClient.post<TeacherLesson>(`/teacher/sections/${sectionId}/lessons`, payload)
}

export async function updateLesson(
  lessonId: string,
  payload: UpdateLessonPayload,
): Promise<TeacherLesson> {
  return httpClient.patch<TeacherLesson>(`/teacher/lessons/${lessonId}`, payload)
}

export async function deleteLesson(lessonId: string): Promise<void> {
  await httpClient.delete(`/teacher/lessons/${lessonId}`)
}
