import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type QuestionType = 'mcq' | 'true_false';

@Entity({ name: 'questions' })
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Index()
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @Column({
    type: 'enum',
    enum: ['mcq', 'true_false'],
    enumName: 'question_type',
  })
  type!: QuestionType;

  @Column({ type: 'text' }) text!: string;

  @Column({ type: 'text', array: true, nullable: true }) options!:
    string[] | null;

  @Column({ name: 'correct_answer', type: 'text' }) correctAnswer!: string;

  @Column({ type: 'text', nullable: true }) difficulty!: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
