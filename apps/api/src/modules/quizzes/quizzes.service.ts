import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  INTERVENTION_EVALUATOR_PORT,
  InterventionEvaluatorPort,
} from '../../common/ports/intervention-evaluator.port';
import {
  NOTIFICATION_PRODUCER_PORT,
  NotificationProducerPort,
} from '../../common/ports/notification-producer.port';
import { CourseEntity } from '../courses/entities/course.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { QuestionEntity, QuestionType } from './entities/question.entity';
import { QuizEntity } from './entities/quiz.entity';
import { QuizQuestionEntity } from './entities/quiz-question.entity';
import { QuizSubmissionEntity } from './entities/quiz-submission.entity';
import { QuizSubmissionAnswerEntity } from './entities/quiz-submission-answer.entity';
import { GradingService } from './grading.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

export interface StudentQuizResponse {
  id: string;
  title: string;
  questions: Array<{
    id: string;
    type: string;
    text: string;
    options: string[] | null;
  }>;
  submission: {
    score: number;
    total: number;
    answers: Array<{ questionId: string; isCorrect: boolean }>;
  } | null;
}

export interface QuizSummary {
  id: string;
  title: string;
  courseId: string;
  sectionId: string | null;
  lessonId: string | null;
  questionCount: number;
  dueAt: string | null;
  submission: { score: number; total: number } | null;
}

export interface TeacherQuizResponse {
  id: string;
  title: string;
  version: number;
  questions: Array<{
    id: string;
    type: string;
    text: string;
    options: string[] | null;
    correctAnswer: string;
  }>;
}

@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);

  constructor(
    @InjectRepository(QuizEntity) private quizRepo: Repository<QuizEntity>,
    @InjectRepository(QuestionEntity)
    private questionRepo: Repository<QuestionEntity>,
    @InjectRepository(QuizQuestionEntity)
    private quizQuestionRepo: Repository<QuizQuestionEntity>,
    @InjectRepository(QuizSubmissionEntity)
    private submissionRepo: Repository<QuizSubmissionEntity>,
    @InjectRepository(QuizSubmissionAnswerEntity)
    private answerRepo: Repository<QuizSubmissionAnswerEntity>,
    @InjectDataSource() private dataSource: DataSource,
    private gradingService: GradingService,
    private enrollmentsService: EnrollmentsService,
    @Inject(INTERVENTION_EVALUATOR_PORT)
    private interventionEvaluator: InterventionEvaluatorPort,
    @Inject(NOTIFICATION_PRODUCER_PORT)
    private notificationProducer: NotificationProducerPort,
  ) {}

  private async assertTeacherOwnsCourse(
    teacherId: string,
    courseId: string,
  ): Promise<void> {
    const { CourseEntity } =
      await import('../../modules/courses/entities/course.entity');
    const course = await this.dataSource
      .getRepository(CourseEntity)
      .findOne({ where: { id: courseId } });
    if (!course || course.teacherId !== teacherId)
      throw new ForbiddenException('You do not have permission on this course');
  }

  private async assertTeacherOwnsQuiz(
    teacherId: string,
    quizId: string,
  ): Promise<QuizEntity> {
    const quiz = await this.quizRepo.findOne({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.assertTeacherOwnsCourse(teacherId, quiz.courseId);
    return quiz;
  }

  // ── Student ──

  async getQuiz(
    quizId: string,
    studentId: string,
  ): Promise<StudentQuizResponse> {
    const quiz = await this.quizRepo.findOne({
      where: { id: quizId, status: 'published' },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.enrollmentsService.assertStudentEnrolled(
      studentId,
      quiz.courseId,
    );

    const quizQuestions = await this.quizQuestionRepo.find({
      where: { quizId },
      order: { orderIndex: 'ASC' },
      relations: { quiz: false },
    });
    const questionIds = quizQuestions.map((qq) => qq.questionId);
    const questions = await this.loadQuestionsByIds(questionIds);
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const submission = await this.submissionRepo.findOne({
      where: { quizId, studentId },
    });
    let submissionData: StudentQuizResponse['submission'] = null;
    if (submission) {
      const answers = await this.answerRepo.find({
        where: { submissionId: submission.id },
      });
      submissionData = {
        score: Number(submission.score),
        total: questions.length,
        answers: answers.map((a) => ({
          questionId: a.questionId,
          isCorrect: a.isCorrect ?? false,
        })),
      };
    }

    return {
      id: quiz.id,
      title: quiz.title,
      questions: quizQuestions.map((qq) => {
        const q = questionMap.get(qq.questionId);
        return { id: q!.id, type: q!.type, text: q!.text, options: q!.options };
      }),
      submission: submissionData,
    };
  }

  async submitQuiz(
    quizId: string,
    studentId: string,
    dto: SubmitQuizDto,
  ): Promise<{
    submissionId: string;
    score: number;
    total: number;
    answers: Array<{ questionId: string; isCorrect: boolean }>;
  }> {
    const quiz = await this.quizRepo.findOne({
      where: { id: quizId, status: 'published' },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.enrollmentsService.assertStudentEnrolled(
      studentId,
      quiz.courseId,
    );

    const existing = await this.submissionRepo.findOne({
      where: { quizId, studentId },
    });
    if (existing)
      throw new ConflictException('You have already submitted this quiz');

    const quizQuestions = await this.quizQuestionRepo.find({
      where: { quizId },
      order: { orderIndex: 'ASC' },
    });
    const questionIds = quizQuestions.map((qq) => qq.questionId);
    const questions = await this.loadQuestionsByIds(questionIds);

    const { score, results } = this.gradingService.grade(
      dto.answers,
      questions,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const submission = await queryRunner.manager.save(QuizSubmissionEntity, {
        quizId,
        studentId,
        score,
        quizVersion: quiz.version,
      });
      await queryRunner.manager.save(
        QuizSubmissionAnswerEntity,
        results.map((r) => ({
          submissionId: submission.id,
          questionId: r.questionId,
          isCorrect: r.isCorrect,
        })),
      );
      await queryRunner.commitTransaction();

      // Fire the struggle-signal evaluator after the submission is
      // durably committed — a secondary side effect that must never
      // fail or delay the primary quiz-submission response.
      const scorePercent =
        questions.length > 0 ? (score / questions.length) * 100 : 0;
      this.interventionEvaluator
        .evaluateSignal({
          kind: 'quiz_score',
          studentId,
          courseId: quiz.courseId,
          weakConcept: quiz.title,
          scorePercent,
          evidenceRefId: submission.id,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Intervention evaluation failed for submission=${submission.id}: ${String(error)}`,
          );
        });

      return {
        submissionId: submission.id,
        score,
        total: questions.length,
        answers: results.map((r) => ({
          questionId: r.questionId,
          isCorrect: r.isCorrect,
        })),
      };
    } catch (e) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async getLessonQuizzes(
    lessonId: string,
    studentId: string,
  ): Promise<QuizSummary[]> {
    const lesson = await this.dataSource
      .getRepository('LessonEntity')
      .findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.enrollmentsService.assertStudentEnrolled(
      studentId,
      lesson.courseId,
    );

    const quizzes = await this.quizRepo.find({
      where: { lessonId, deletedAt: IsNull(), status: 'published' },
    });
    return this.buildSummaries(quizzes, studentId);
  }

  async getSectionQuizzes(
    sectionId: string,
    studentId: string,
  ): Promise<QuizSummary[]> {
    const section = await this.dataSource
      .getRepository('SectionEntity')
      .findOne({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');
    await this.enrollmentsService.assertStudentEnrolled(
      studentId,
      section.courseId,
    );

    const quizzes = await this.quizRepo.find({
      where: { sectionId, deletedAt: IsNull(), status: 'published' },
    });
    return this.buildSummaries(quizzes, studentId);
  }

  async getCourseQuizzes(
    courseId: string,
    studentId: string,
  ): Promise<QuizSummary[]> {
    const course = await this.dataSource
      .getRepository(CourseEntity)
      .findOne({ where: { id: courseId, deletedAt: IsNull() } });
    if (!course) throw new NotFoundException('Course not found');
    await this.enrollmentsService.assertStudentEnrolled(studentId, courseId);

    const quizzes = await this.quizRepo.find({
      where: { courseId, deletedAt: IsNull(), status: 'published' },
      order: { createdAt: 'DESC' },
    });
    return this.buildSummaries(quizzes, studentId);
  }

  private async buildSummaries(
    quizzes: QuizEntity[],
    studentId: string,
  ): Promise<QuizSummary[]> {
    const results: QuizSummary[] = [];
    for (const quiz of quizzes) {
      const count = await this.quizQuestionRepo.count({
        where: { quizId: quiz.id },
      });
      const submission = await this.submissionRepo.findOne({
        where: { quizId: quiz.id, studentId },
      });
      results.push({
        id: quiz.id,
        title: quiz.title,
        courseId: quiz.courseId,
        sectionId: quiz.sectionId,
        lessonId: quiz.lessonId,
        questionCount: count,
        dueAt: quiz.dueAt ? quiz.dueAt.toISOString() : null,
        submission: submission
          ? { score: Number(submission.score), total: count }
          : null,
      });
    }
    return results;
  }

  // ── Teacher ──

  async getTeacherQuiz(
    quizId: string,
    teacherId: string,
  ): Promise<TeacherQuizResponse> {
    const quiz = await this.assertTeacherOwnsQuiz(teacherId, quizId);

    const qq = await this.quizQuestionRepo.find({
      where: { quizId },
      order: { orderIndex: 'ASC' },
    });
    const questions = await this.loadQuestionsByIds(
      qq.map((l) => l.questionId),
    );

    return {
      id: quiz.id,
      title: quiz.title,
      version: quiz.version,
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
      })),
    };
  }

  async listCourseQuizzes(
    courseId: string,
    teacherId: string,
  ): Promise<TeacherQuizResponse[]> {
    await this.assertTeacherOwnsCourse(teacherId, courseId);

    // AI drafts awaiting review live in the exam-generation review screen,
    // not here — they only show up in this list once the teacher accepts
    // them (which flips them to 'published').
    const quizzes = await this.quizRepo.find({
      where: { courseId, deletedAt: IsNull(), status: 'published' },
    });

    const results: TeacherQuizResponse[] = [];
    for (const quiz of quizzes) {
      const qq = await this.quizQuestionRepo.find({
        where: { quizId: quiz.id },
        order: { orderIndex: 'ASC' },
      });
      const questions = await this.loadQuestionsByIds(
        qq.map((l) => l.questionId),
      );
      results.push({
        id: quiz.id,
        title: quiz.title,
        version: quiz.version,
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
        })),
      });
    }
    return results;
  }

  async deleteQuiz(quizId: string, teacherId: string): Promise<void> {
    const quiz = await this.assertTeacherOwnsQuiz(teacherId, quizId);
    await this.quizRepo.softRemove(quiz);
  }

  async createQuiz(
    teacherId: string,
    dto: CreateQuizDto,
  ): Promise<TeacherQuizResponse> {
    await this.assertTeacherOwnsCourse(teacherId, dto.courseId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const questions = (await queryRunner.manager.save(
        QuestionEntity,
        dto.questions.map((q) => ({
          ...q,
          type: q.type as QuestionType,
          courseId: dto.courseId,
        })),
      )) as QuestionEntity[];
      const quiz = await queryRunner.manager.save(QuizEntity, {
        courseId: dto.courseId,
        sectionId: dto.sectionId ?? null,
        lessonId: dto.lessonId ?? null,
        title: dto.title,
        createdBy: teacherId,
        generationType: 'manual',
      });
      await queryRunner.manager.save(
        QuizQuestionEntity,
        questions.map((q, i) => ({
          quizId: quiz.id,
          questionId: q.id,
          orderIndex: i,
        })),
      );
      await queryRunner.commitTransaction();

      // Fire-and-forget, same as the intervention evaluator below — a
      // notification hiccup must never fail the already-committed quiz.
      this.notifyEnrolledStudents(dto.courseId, quiz.id, quiz.title).catch(
        (error: unknown) => {
          this.logger.warn(
            `Quiz-ready notification failed for quiz=${quiz.id}: ${String(error)}`,
          );
        },
      );

      return {
        id: quiz.id,
        title: quiz.title,
        version: quiz.version,
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
        })),
      };
    } catch (e) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  // Notifies every actively enrolled student that a new quiz is
  // available — used for manual creation here and for AI-generated
  // quizzes in ExamGenerationService#accept.
  private async notifyEnrolledStudents(
    courseId: string,
    quizId: string,
    quizTitle: string,
  ): Promise<void> {
    const studentIds =
      await this.enrollmentsService.listActiveStudentIds(courseId);
    await Promise.all(
      studentIds.map((studentId) =>
        this.notificationProducer.notify({
          userId: studentId,
          type: 'quiz_ready',
          title: 'اختبار جديد متاح',
          message: `اختبار جديد "${quizTitle}" متاح دلوقتي، جاهز للحل.`,
          relatedEntityType: 'quiz',
          relatedEntityId: quizId,
        }),
      ),
    );
  }

  async updateQuiz(
    quizId: string,
    teacherId: string,
    dto: UpdateQuizDto,
  ): Promise<TeacherQuizResponse> {
    const quiz = await this.assertTeacherOwnsQuiz(teacherId, quizId);

    if (dto.questions) {
      const subCount = await this.submissionRepo.count({ where: { quizId } });
      if (subCount > 0)
        throw new ConflictException(
          'Cannot edit a quiz that has been submitted',
        );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (dto.title) {
        await queryRunner.manager.update(QuizEntity, quizId, {
          title: dto.title,
        });
      }

      if (dto.questions) {
        const existingLinks = await queryRunner.manager.find(
          QuizQuestionEntity,
          { where: { quizId } },
        );
        const existingQuestionIds = new Set(
          existingLinks.map((l) => l.questionId),
        );
        const incomingIds = new Set(
          dto.questions.filter((q) => q.id).map((q) => q.id!),
        );
        const toRemove = existingLinks.filter(
          (l) => !incomingIds.has(l.questionId),
        );
        for (const link of toRemove) {
          await queryRunner.manager.remove(link);
        }

        for (let i = 0; i < dto.questions.length; i++) {
          const qDto = dto.questions[i];
          if (qDto.id && existingQuestionIds.has(qDto.id)) {
            await queryRunner.manager.update(QuestionEntity, qDto.id, {
              type: qDto.type as QuestionType,
              text: qDto.text,
              options: qDto.options,
              correctAnswer: qDto.correctAnswer,
            });
          } else {
            const newQ = await queryRunner.manager.save(QuestionEntity, {
              courseId: quiz.courseId,
              type: qDto.type as QuestionType,
              text: qDto.text,
              options: qDto.options,
              correctAnswer: qDto.correctAnswer,
            });
            await queryRunner.manager.save(QuizQuestionEntity, {
              quizId,
              questionId: newQ.id,
              orderIndex: i,
            });
          }
        }
      }

      quiz.version += 1;
      await queryRunner.manager.update(QuizEntity, quizId, {
        version: quiz.version,
      });
      await queryRunner.commitTransaction();

      const updated = await this.quizRepo.findOne({ where: { id: quizId } });
      const qq = await this.quizQuestionRepo.find({
        where: { quizId },
        order: { orderIndex: 'ASC' },
      });
      const questions = await this.loadQuestionsByIds(
        qq.map((l) => l.questionId),
      );
      return {
        id: updated!.id,
        title: updated!.title,
        version: updated!.version,
        questions: questions.map((q) => ({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
        })),
      };
    } catch (e) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  private async loadQuestionsByIds(
    questionIds: string[],
  ): Promise<QuestionEntity[]> {
    if (questionIds.length === 0) {
      return [];
    }

    const questions = await this.questionRepo.find({
      where: { id: In(questionIds) },
    });
    const questionMap = new Map(
      questions.map((question) => [question.id, question]),
    );

    return questionIds
      .map((questionId) => questionMap.get(questionId))
      .filter((question): question is QuestionEntity => Boolean(question));
  }
}
