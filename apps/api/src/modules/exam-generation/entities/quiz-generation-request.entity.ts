import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type QuizGenerationScopeType = 'lesson' | 'section' | 'course';
export type QuizGenerationRequestStatus =
  | 'queued'
  | 'processing'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'failed';

export interface QuestionSpecItem {
  type: 'mcq' | 'true_false';
  count: number;
}

/**
 * One row per "teacher asks the AI for an exam" workflow instance.
 * `quizId` stays null until the worker produces a first draft, then
 * stays the same across regenerate-with-feedback attempts — see
 * `apps/worker/src/processors/exam-generation.processor.ts`.
 */
@Entity({ name: 'quiz_generation_requests' })
export class QuizGenerationRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: ['lesson', 'section', 'course'],
    enumName: 'quiz_generation_scope_type',
  })
  scopeType!: QuizGenerationScopeType;

  @Column({ name: 'scope_id', type: 'uuid' })
  scopeId!: string;

  @Index()
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Index()
  @Column({ name: 'quiz_id', type: 'uuid', nullable: true })
  quizId!: string | null;

  @Column({
    type: 'enum',
    enum: ['queued', 'processing', 'pending_review', 'accepted', 'rejected', 'failed'],
    enumName: 'quiz_generation_request_status',
    default: 'queued',
  })
  status!: QuizGenerationRequestStatus;

  @Column({ type: 'text' })
  difficulty!: string;

  @Column({ name: 'question_spec', type: 'jsonb' })
  questionSpec!: QuestionSpecItem[];

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
