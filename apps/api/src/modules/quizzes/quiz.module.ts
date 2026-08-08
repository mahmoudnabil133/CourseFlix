import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { InterventionsModule } from '../interventions/interventions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { QuestionEntity } from './entities/question.entity';
import { QuizEntity } from './entities/quiz.entity';
import { QuizQuestionEntity } from './entities/quiz-question.entity';
import { QuizSubmissionEntity } from './entities/quiz-submission.entity';
import { QuizSubmissionAnswerEntity } from './entities/quiz-submission-answer.entity';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { GradingService } from './grading.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuestionEntity,
      QuizEntity,
      QuizQuestionEntity,
      QuizSubmissionEntity,
      QuizSubmissionAnswerEntity,
    ]),
    EnrollmentsModule,
    InterventionsModule,
    SessionsModule,
    NotificationsModule,
  ],
  controllers: [QuizzesController],
  providers: [QuizzesService, GradingService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
