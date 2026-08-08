import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { JobsModule } from '../jobs/jobs.module';
import { CourseEntity } from '../courses/entities/course.entity';
import { SectionEntity } from '../courses/entities/section.entity';
import { LessonEntity } from '../courses/entities/lesson.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentEntity } from './entities/document.entity';
import { FileEntity } from './entities/file.entity';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { StudentDocumentsController } from './student-documents.controller';
import {
  LocalStorageAdapter,
  STORAGE_ADAPTER,
} from './storage/local-storage.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      FileEntity,
      CourseEntity,
      SectionEntity,
      LessonEntity,
    ]),
    // Buffered in memory, not disk — DocumentsService needs the raw
    // bytes for the SHA-256 checksum and the PDF magic-byte check
    // before LocalStorageAdapter ever writes to STORAGE_ROOT.
    MulterModule.register({ storage: memoryStorage() }),
    // Required for AuthGuard to resolve SessionsService within this
    // module's own DI context (same fix as CF-BUG-001 in TeacherModule).
    SessionsModule,
    // Real BullMQ-backed job queue (sprint2-plan.md §2.1 one-line swap).
    // JobsModule exports JOB_QUEUE_PORT bound to BullMqJobQueue.
    JobsModule,
    // For DocumentsService.listStudentDocuments/getFileForStudentDownload
    // to verify enrollment before showing/streaming a document.
    EnrollmentsModule,
  ],
  controllers: [DocumentsController, StudentDocumentsController],
  providers: [
    DocumentsService,
    { provide: STORAGE_ADAPTER, useClass: LocalStorageAdapter },
  ],
  exports: [STORAGE_ADAPTER],
})
export class DocumentsModule {}
