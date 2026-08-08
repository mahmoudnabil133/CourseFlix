import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { SessionsModule } from '../sessions/sessions.module';
import { VideoIngestionModule } from '../video-ingestion/video-ingestion.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CourseEntity } from './entities/course.entity';
import { SectionEntity } from './entities/section.entity';
import { LessonEntity } from './entities/lesson.entity';
import { VideoEntity } from '../lessons/entities/video.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseEntity,
      SectionEntity,
      LessonEntity,
      VideoEntity,
    ]),
    EnrollmentsModule,
    // Required for CoursesController's AuthGuard to resolve
    // SessionsService within this module's DI context (CF-BUG-001).
    SessionsModule,
    VideoIngestionModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
