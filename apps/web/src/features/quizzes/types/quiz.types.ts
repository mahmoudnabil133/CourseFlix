export interface QuizQuestion {
  id: string; type: 'mcq' | 'true_false'; text: string; options: string[];
}

export interface Quiz {
  id: string; title: string; questions: QuizQuestion[];
  submission: { score: number; total: number; answers: Array<{ questionId: string; isCorrect: boolean }> } | null;
}

export interface QuizSummary {
  id: string; title: string; courseId: string; sectionId: string | null; lessonId: string | null; questionCount: number;
  dueAt: string | null;
  submission: { score: number; total: number } | null;
}

export interface SubmitAnswer {
  questionId: string; selectedAnswer: string;
}

export interface QuizResult {
  submissionId: string; score: number; total: number;
  answers: Array<{ questionId: string; isCorrect: boolean }>;
}

export interface TeacherQuizQuestion {
  id: string
  type: 'mcq' | 'true_false'
  text: string
  options: string[] | null
  correctAnswer: string
}

export interface TeacherQuiz {
  id: string
  title: string
  version: number
  questions: TeacherQuizQuestion[]
}

export interface TeacherQuizQuestionPayload {
  id?: string
  type: 'mcq' | 'true_false'
  text: string
  options: string[]
  correctAnswer: string
}

export interface CreateTeacherQuizPayload {
  courseId: string
  sectionId?: string
  lessonId?: string
  title: string
  questions: TeacherQuizQuestionPayload[]
}

export interface UpdateTeacherQuizPayload {
  title?: string
  questions?: TeacherQuizQuestionPayload[]
}
