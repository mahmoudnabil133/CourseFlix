import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from '../courses/entities/course.entity';
import { SectionEntity } from '../courses/entities/section.entity';
import { LessonEntity } from '../courses/entities/lesson.entity';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuizEntity } from '../quizzes/entities/quiz.entity';
import { QuestionEntity } from '../quizzes/entities/question.entity';
import { QuizQuestionEntity } from '../quizzes/entities/quiz-question.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { QuizGenerationRequestEntity } from './entities/quiz-generation-request.entity';
import { QuizGenerationFeedbackEntity } from './entities/quiz-generation-feedback.entity';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizGenerationRequestEntity,
      QuizGenerationFeedbackEntity,
      QuizEntity,
      QuestionEntity,
      QuizQuestionEntity,
      CourseEntity,
      SectionEntity,
      LessonEntity,
    ]),
    // Required for AuthGuard to resolve SessionsService within this
    // module's own DI context (same fix as CF-BUG-001 in TeacherModule).
    SessionsModule,
    JobsModule,
    EnrollmentsModule,
    NotificationsModule,
  ],
  controllers: [ExamGenerationController],
  providers: [ExamGenerationService],
  exports: [ExamGenerationService],
})
export class ExamGenerationModule {}
