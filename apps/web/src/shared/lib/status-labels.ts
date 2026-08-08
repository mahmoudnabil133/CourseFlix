import type { CourseStatus } from '../../features/courses/types/course.types'
import type { EnrollmentStatus } from '../../features/student/types/student.types'
import type { DocumentProcessingStatus } from '../../features/documents/types/document.types'
import type { LessonProgressStatus } from '../../features/lessons/types/lesson.types'
import type { ExamGenerationRequestStatus } from '../../features/exam-generation/types/exam-generation.types'

/**
 * Arabic labels + M3 chip variants for every status the UI renders.
 *
 * Centralised because the raw enum values were previously printed
 * straight into the markup ("published", "active"), which left English
 * scattered through an otherwise Arabic, RTL product.
 */

type ChipVariant = '' | 'green' | 'pink' | 'red' | 'outline'

export const COURSE_STATUS: Record<CourseStatus, { label: string; chip: ChipVariant }> = {
  draft: { label: 'مسودة', chip: 'outline' },
  published: { label: 'منشورة', chip: 'green' },
  archived: { label: 'مؤرشفة', chip: '' },
}

export const ENROLLMENT_STATUS: Record<EnrollmentStatus, { label: string; chip: ChipVariant }> = {
  active: { label: 'نشط', chip: 'green' },
  suspended: { label: 'موقوف', chip: 'red' },
  completed: { label: 'مكتمل', chip: '' },
}

export const LESSON_PROGRESS_STATUS: Record<
  LessonProgressStatus,
  { label: string; chip: ChipVariant }
> = {
  not_started: { label: 'لم تبدأ بعد', chip: 'outline' },
  in_progress: { label: 'قيد المشاهدة', chip: 'pink' },
  completed: { label: 'مكتمل', chip: 'green' },
}

export const DOCUMENT_STATUS: Record<
  DocumentProcessingStatus,
  { label: string; chip: ChipVariant; icon: string }
> = {
  pending: { label: 'في الانتظار', chip: 'outline', icon: 'schedule' },
  processing: { label: 'قيد المعالجة', chip: 'pink', icon: 'autorenew' },
  completed: { label: 'تمت المعالجة', chip: 'green', icon: 'check_circle' },
  failed: { label: 'فشلت المعالجة', chip: 'red', icon: 'error' },
}

export const EXAM_GENERATION_STATUS: Record<
  ExamGenerationRequestStatus,
  { label: string; chip: ChipVariant; icon: string }
> = {
  queued: { label: 'في الانتظار', chip: 'outline', icon: 'schedule' },
  processing: { label: 'الذكاء الاصطناعي يعمل...', chip: 'pink', icon: 'autorenew' },
  pending_review: { label: 'بانتظار مراجعتك', chip: 'pink', icon: 'rate_review' },
  accepted: { label: 'مقبول ومنشور', chip: 'green', icon: 'check_circle' },
  rejected: { label: 'مرفوض', chip: '', icon: 'cancel' },
  failed: { label: 'فشل الإنشاء', chip: 'red', icon: 'error' },
}
