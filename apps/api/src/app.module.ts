import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './modules/admin/admin.module';
import { AgentLogsModule } from './modules/agent-logs/agent-logs.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { CoursesModule } from './modules/courses/courses.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { ExamGenerationModule } from './modules/exam-generation/exam-generation.module';
import { HealthModule } from './modules/health/health.module';
import { InterventionsModule } from './modules/interventions/interventions.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymobModule } from './modules/paymob/paymob.module';
import { QuizzesModule } from './modules/quizzes/quiz.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StudentModule } from './modules/student/student.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { UsersModule } from './modules/users/users.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { SalesModule } from './modules/sales/sales.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { VideoQaModule } from './modules/video-qa/video-qa.module';

// Local docker-compose Postgres has no SSL listener; only the deployed
// Neon database needs `ssl: true` (its own hostname is never localhost).
const isLocalDatabaseUrl = /localhost|127\.0\.0\.1/.test(
  process.env.DATABASE_URL ?? '',
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true,
      port: 5432,
      ssl: isLocalDatabaseUrl ? false : true,
      extra: isLocalDatabaseUrl
        ? {}
        : {
            ssl: {
              rejectUnauthorized: false, // Allows connection to Neon over safe TLS
            },
          },
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    CoursesModule,
    EnrollmentsModule,
    StudentModule,
    TeacherModule,
    DocumentsModule,
    NotificationsModule,
    PaymobModule,
    QuizzesModule,
    ExamGenerationModule,
    JobsModule,
    RetrievalModule,
    LessonsModule,
    TutorModule,
    VideoQaModule,
    AgentLogsModule,
    InterventionsModule,
    CommerceModule,
    SalesModule,
    AnalyticsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
