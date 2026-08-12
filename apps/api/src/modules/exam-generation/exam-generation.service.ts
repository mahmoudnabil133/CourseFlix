import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  NOTIFICATION_PRODUCER_PORT,
  NotificationProducerPort,
} from '../../common/ports/notification-producer.port';
import { CourseEntity } from '../courses/entities/course.entity';
import { SectionEntity } from '../courses/entities/section.entity';
import { LessonEntity } from '../courses/entities/lesson.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { QuizEntity } from '../quizzes/entities/quiz.entity';
import { QuestionEntity } from '../quizzes/entities/question.entity';
import { QuizQuestionEntity } from '../quizzes/entities/quiz-question.entity';
import { JobsService } from '../jobs/jobs.service';
import { CreateExamGenerationRequestDto } from './dto/create-exam-generation-request.dto';
import {
  QuestionSpecItem,
  QuizGenerationRequestEntity,
} from './entities/quiz-generation-request.entity';
import { QuizGenerationFeedbackEntity } from './entities/quiz-generation-feedback.entity';

export interface ExamGenerationRequestSummary {
  id: string;
  courseId: string;
  scopeType: string;
  scopeId: string;
  status: string;
  difficulty: string;
  questionSpec: QuestionSpecItem[];
  dueAt: string;
  attemptNumber: number;
  errorMessage: string | null;
  quizId: string | null;
  createdAt: string;
}

export interface ExamGenerationRequestDetail extends ExamGenerationRequestSummary {
  feedback: Array<{ id: string; message: string; createdAt: string }>;
  draft: {
    title: string;
    version: number;
    questions: Array<{
      id: string;
      type: string;
      text: string;
      options: string[] | null;
      correctAnswer: string;
      difficulty: string | null;
    }>;
  } | null;
}

@Injectable()
export class ExamGenerationService {
  constructor(
    @InjectRepository(QuizGenerationRequestEntity)
    private readonly requestRepo: Repository<QuizGenerationRequestEntity>,
    @InjectRepository(QuizGenerationFeedbackEntity)
    private readonly feedbackRepo: Repository<QuizGenerationFeedbackEntity>,
    @InjectRepository(QuizEntity)
    private readonly quizRepo: Repository<QuizEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepo: Repository<QuestionEntity>,
    @InjectRepository(QuizQuestionEntity)
    private readonly quizQuestionRepo: Repository<QuizQuestionEntity>,
    @InjectRepository(CourseEntity)
    private readonly coursesRepo: Repository<CourseEntity>,
    @InjectRepository(SectionEntity)
    private readonly sectionsRepo: Repository<SectionEntity>,
    @InjectRepository(LessonEntity)
    private readonly lessonsRepo: Repository<LessonEntity>,
    private readonly jobsService: JobsService,
    private readonly enrollmentsService: EnrollmentsService,
    @Inject(NOTIFICATION_PRODUCER_PORT)
    private readonly notificationProducer: NotificationProducerPort,
  ) {}

  async createRequest(
    teacherId: string,
    dto: CreateExamGenerationRequestDto,
  ): Promise<ExamGenerationRequestSummary> {
    await this.assertTeacherOwnsCourse(dto.courseId, teacherId);
    const scopeId = await this.resolveAndValidateScope(
      dto.courseId,
      dto.scopeType,
      dto.scopeId,
    );

    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'الديدلاين يجب أن يكون تاريخًا في المستقبل.',
      );
    }

    const request = await this.requestRepo.save(
      this.requestRepo.create({
        courseId: dto.courseId,
        scopeType: dto.scopeType,
        scopeId,
        teacherId,
        status: 'queued',
        difficulty: dto.difficulty,
        questionSpec: dto.questionSpec,
        dueAt,
        attemptNumber: 1,
      }),
    );

    await this.jobsService.enqueueExamGeneration(request.id);

    return this.toSummary(request);
  }

  async listForCourse(
    courseId: string,
    teacherId: string,
  ): Promise<ExamGenerationRequestSummary[]> {
    await this.assertTeacherOwnsCourse(courseId, teacherId);
    const requests = await this.requestRepo.find({
      where: { courseId },
      order: { createdAt: 'DESC' },
    });
    return requests.map((request) => this.toSummary(request));
  }

  async getRequest(
    requestId: string,
    teacherId: string,
  ): Promise<ExamGenerationRequestDetail> {
    const request = await this.loadOwnedRequest(requestId, teacherId);

    const feedback = await this.feedbackRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });

    return {
      ...this.toSummary(request),
      feedback: feedback.map((entry) => ({
        id: entry.id,
        message: entry.message,
        createdAt: entry.createdAt.toISOString(),
      })),
      draft: await this.loadDraft(request.quizId),
    };
  }

  async accept(
    requestId: string,
    teacherId: string,
  ): Promise<ExamGenerationRequestSummary> {
    const request = await this.loadOwnedRequest(requestId, teacherId);
    if (request.status !== 'pending_review' || !request.quizId) {
      throw new ConflictException('هذا الطلب ليس بانتظار المراجعة.');
    }

    const quiz = await this.quizRepo.findOne({ where: { id: request.quizId } });
    await this.quizRepo.update(request.quizId, { status: 'published' });
    request.status = 'accepted';
    await this.requestRepo.save(request);

    if (quiz) {
      await this.notifyEnrolledStudents(request.courseId, quiz.id, quiz.title);
    }

    return this.toSummary(request);
  }

  // Fired once the quiz actually becomes visible to students (accept
  // here; QuizzesService#createQuiz for manually created quizzes) — a
  // notification failure must never fail the accept action itself.
  private async notifyEnrolledStudents(
    courseId: string,
    quizId: string,
    quizTitle: string,
  ): Promise<void> {
    try {
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
    } catch {
      // Swallowed on purpose — the quiz is already published; a
      // notification hiccup shouldn't surface as an accept failure.
    }
  }

  async reject(
    requestId: string,
    teacherId: string,
  ): Promise<ExamGenerationRequestSummary> {
    const request = await this.loadOwnedRequest(requestId, teacherId);
    if (request.status !== 'pending_review' || !request.quizId) {
      throw new ConflictException('هذا الطلب ليس بانتظار المراجعة.');
    }

    const quiz = await this.quizRepo.findOne({ where: { id: request.quizId } });
    if (quiz) {
      await this.quizRepo.softRemove(quiz);
    }
    request.status = 'rejected';
    await this.requestRepo.save(request);

    return this.toSummary(request);
  }

  async submitFeedback(
    requestId: string,
    teacherId: string,
    message: string,
  ): Promise<ExamGenerationRequestSummary> {
    const request = await this.loadOwnedRequest(requestId, teacherId);
    if (request.status !== 'pending_review') {
      throw new ConflictException(
        'لا يمكن إرسال تعديل إلا بعد ظهور مسودة الاختبار.',
      );
    }

    await this.feedbackRepo.save(
      this.feedbackRepo.create({ requestId, message: message.trim() }),
    );

    request.status = 'queued';
    request.attemptNumber += 1;
    request.errorMessage = null;
    await this.requestRepo.save(request);

    await this.jobsService.enqueueExamGeneration(request.id);

    return this.toSummary(request);
  }

  private async loadDraft(
    quizId: string | null,
  ): Promise<ExamGenerationRequestDetail['draft']> {
    if (!quizId) return null;

    const quiz = await this.quizRepo.findOne({ where: { id: quizId } });
    if (!quiz) return null;

    const links = await this.quizQuestionRepo.find({
      where: { quizId: quiz.id },
      order: { orderIndex: 'ASC' },
    });
    const questions = await this.questionRepo.find({
      where: { id: In(links.map((link) => link.questionId)) },
    });
    const questionMap = new Map(
      questions.map((question) => [question.id, question]),
    );

    return {
      title: quiz.title,
      version: quiz.version,
      questions: links
        .map((link) => questionMap.get(link.questionId))
        .filter((question): question is QuestionEntity => Boolean(question))
        .map((question) => ({
          id: question.id,
          type: question.type,
          text: question.text,
          options: question.options,
          correctAnswer: question.correctAnswer,
          difficulty: question.difficulty,
        })),
    };
  }

  private async loadOwnedRequest(
    requestId: string,
    teacherId: string,
  ): Promise<QuizGenerationRequestEntity> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this request');
    }
    return request;
  }

  private async assertTeacherOwnsCourse(
    courseId: string,
    teacherId: string,
  ): Promise<void> {
    const course = await this.coursesRepo.findOne({
      where: { id: courseId, deletedAt: IsNull() },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('You do not have permission on this course');
    }
  }

  private async resolveAndValidateScope(
    courseId: string,
    scopeType: 'lesson' | 'section' | 'course',
    scopeId: string | undefined,
  ): Promise<string> {
    if (scopeType === 'course') {
      return courseId;
    }

    if (!scopeId) {
      throw new BadRequestException(
        `scopeId is required when scopeType is "${scopeType}".`,
      );
    }

    if (scopeType === 'section') {
      const section = await this.sectionsRepo.findOne({
        where: { id: scopeId, courseId, deletedAt: IsNull() },
      });
      if (!section)
        throw new NotFoundException('Section not found in this course.');
      return section.id;
    }
    const lesson = await this.lessonsRepo.findOne({
      where: { id: scopeId, courseId, deletedAt: IsNull() },
    });
    if (!lesson)
      throw new NotFoundException('Lesson not found in this course.');
    return lesson.id;
  }

  private toSummary(
    request: QuizGenerationRequestEntity,
  ): ExamGenerationRequestSummary {
    return {
      id: request.id,
      courseId: request.courseId,
      scopeType: request.scopeType,
      scopeId: request.scopeId,
      status: request.status,
      difficulty: request.difficulty,
      questionSpec: request.questionSpec,
      dueAt: request.dueAt.toISOString(),
      attemptNumber: request.attemptNumber,
      errorMessage: request.errorMessage,
      quizId: request.quizId,
      createdAt: request.createdAt.toISOString(),
    };
  }
}
