import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { CourseEntity } from '../courses/entities/course.entity';
import { EnrollmentEntity } from '../enrollments/entities/enrollment.entity';
import { OrderEntity } from '../commerce/entities/order.entity';
import { OrderItemEntity } from '../commerce/entities/order-item.entity';
import { PaymentEntity } from '../commerce/entities/payment.entity';
import { QuizEntity } from '../quizzes/entities/quiz.entity';
import { VideoEntity } from '../lessons/entities/video.entity';
import { DocumentEntity } from '../documents/entities/document.entity';
import { FileEntity } from '../documents/entities/file.entity';
import { InterventionEntity } from '../interventions/entities/intervention.entity';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { AgentLogEntity } from '../agent-logs/entities/agent-log.entity';
import { UsersModule } from '../users/users.module';
import { CoursesModule } from '../courses/courses.module';
import { QuizzesModule } from '../quizzes/quiz.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { AdminCoursesService } from './services/admin-courses.service';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { AdminOrdersService } from './services/admin-orders.service';
import { AdminQuizzesController } from './controllers/admin-quizzes.controller';
import { AdminQuizzesService } from './services/admin-quizzes.service';
import { AdminDocumentsController } from './controllers/admin-documents.controller';
import { AdminDocumentsService } from './services/admin-documents.service';
import { AdminInterventionsController } from './controllers/admin-interventions.controller';
import { AdminInterventionsService } from './services/admin-interventions.service';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminAgentLogsController } from './controllers/admin-agent-logs.controller';
import { AdminAgentLogsService } from './services/admin-agent-logs.service';
import { AdminAnalyticsController } from './controllers/admin-analytics.controller';
import { AdminAnalyticsService } from './services/admin-analytics.service';

@Module({
  // SessionsModule is required directly here (not just transitively) for
  // AuthGuard to resolve SessionsService within this module's DI context —
  // same gotcha documented in teacher.module.ts (CF-BUG-001).
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      CourseEntity,
      EnrollmentEntity,
      OrderEntity,
      OrderItemEntity,
      PaymentEntity,
      QuizEntity,
      VideoEntity,
      DocumentEntity,
      FileEntity,
      InterventionEntity,
      NotificationEntity,
      AgentLogEntity,
    ]),
    UsersModule,
    CoursesModule,
    QuizzesModule,
    DocumentsModule,
    NotificationsModule,
    SessionsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminCoursesController,
    AdminOrdersController,
    AdminQuizzesController,
    AdminDocumentsController,
    AdminInterventionsController,
    AdminNotificationsController,
    AdminAgentLogsController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminUsersService,
    AdminCoursesService,
    AdminOrdersService,
    AdminQuizzesService,
    AdminDocumentsService,
    AdminInterventionsService,
    AdminNotificationsService,
    AdminAgentLogsService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
