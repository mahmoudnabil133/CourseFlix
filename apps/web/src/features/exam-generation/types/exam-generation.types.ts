export type ExamScopeType = 'lesson' | 'section' | 'course'
export type ExamDifficulty = 'easy' | 'medium' | 'hard'
export type QuestionType = 'mcq' | 'true_false'

export type ExamGenerationRequestStatus =
  | 'queued'
  | 'processing'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'failed'

export interface QuestionSpecItem {
  type: QuestionType
  count: number
}

export interface ExamGenerationRequestSummary {
  id: string
  courseId: string
  scopeType: ExamScopeType
  scopeId: string
  status: ExamGenerationRequestStatus
  difficulty: ExamDifficulty
  questionSpec: QuestionSpecItem[]
  dueAt: string
  attemptNumber: number
  errorMessage: string | null
  quizId: string | null
  createdAt: string
}

export interface ExamGenerationDraftQuestion {
  id: string
  type: QuestionType
  text: string
  options: string[] | null
  correctAnswer: string
  difficulty: string | null
}

export interface ExamGenerationRequestDetail extends ExamGenerationRequestSummary {
  feedback: Array<{ id: string; message: string; createdAt: string }>
  draft: {
    title: string
    version: number
    questions: ExamGenerationDraftQuestion[]
  } | null
}

export interface CreateExamGenerationRequestPayload {
  courseId: string
  scopeType: ExamScopeType
  scopeId?: string
  difficulty: ExamDifficulty
  questionSpec: QuestionSpecItem[]
  dueAt: string
}
