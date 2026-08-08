import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { JOB_QUEUE_PORT } from '../../common/ports/job-queue.port';
import type { JobQueuePort } from '../../common/ports/job-queue.port';
import { CourseEntity } from '../courses/entities/course.entity';
import { SectionEntity } from '../courses/entities/section.entity';
import { LessonEntity } from '../courses/entities/lesson.entity';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import {
  DocumentEntity,
  DocumentProcessingStatus,
} from './entities/document.entity';
import { FileEntity } from './entities/file.entity';
import { STORAGE_ADAPTER } from './storage/local-storage.adapter';
import type { StorageAdapter } from './storage/local-storage.adapter';

const PDF_MAGIC_BYTES = Buffer.from('%PDF');
const DEFAULT_MAX_UPLOAD_BYTES = 20_971_520; // 20 MiB, matches .env.example
const ARABIC_TEXT_PATTERN = /[\u0600-\u06ff]/;

export interface CourseDocumentResponse {
  id: string;
  fileName: string;
  processingStatus: DocumentProcessingStatus;
  version: number;
  createdAt: string;
  errorMessage: string | null;
}

export interface UploadDocumentResponse {
  id: string;
  fileName: string;
  processingStatus: DocumentProcessingStatus;
  version: number;
}

export interface RetryDocumentResponse {
  id: string;
  processingStatus: DocumentProcessingStatus;
}

export interface StudentDocumentResponse {
  id: string;
  fileName: string;
  createdAt: string;
}

export interface StudentDocumentFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentsRepository: Repository<DocumentEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
    @InjectRepository(SectionEntity)
    private readonly sectionsRepository: Repository<SectionEntity>,
    @InjectRepository(LessonEntity)
    private readonly lessonsRepository: Repository<LessonEntity>,
    @Inject(STORAGE_ADAPTER)
    private readonly storageAdapter: StorageAdapter,
    @Inject(JOB_QUEUE_PORT)
    private readonly jobQueue: JobQueuePort,
    private readonly enrollmentsService: EnrollmentsService
  ) { }

  /**
   * Validation runs before a single byte is stored, in the order fixed
   * by sprint2-plan.md's H-2: file shape -> size -> non-empty ->
   * ownership. A rejected upload never creates a `documents` row.
   *
   * Re-uploading a file whose SHA-256 already matches an active
   * document *in the same course* bumps that document's version
   * instead of creating a duplicate row — scoped to the course because
   * the same PDF attached to a different course is a distinct document,
   * not a new version of an unrelated one.
   */
  async uploadDocument(
    courseId: string,
    teacherId: string,
    upload: UploadDocumentDto,
  ): Promise<UploadDocumentResponse> {
    this.assertValidPdf(upload);
    this.assertWithinSizeLimit(upload.sizeBytes);
    this.assertNonEmpty(upload.sizeBytes);
    await this.assertTeacherOwnsCourse(courseId, teacherId);
    const { sectionId, lessonId } = await this.resolvePlacement(
      courseId,
      upload.sectionId,
      upload.lessonId,
    );

    const checksum = createHash('sha256').update(upload.buffer).digest('hex');
    const originalName = this.normalizeOriginalName(upload.originalName);
    const stored = await this.storageAdapter.save(upload.buffer);
    const file = await this.filesRepository.save(
      this.filesRepository.create({
        fileName: originalName,
        mimeType: upload.mimeType,
        sizeBytes: String(upload.sizeBytes),
        storageProvider: stored.storageProvider,
        storagePath: stored.storagePath,
        checksum,
        uploadedBy: teacherId,
      }),
    );

    const existing = await this.documentsRepository.findOne({
      where: { courseId, checksum, deletedAt: IsNull() },
    });

    const document = existing
      ? await this.documentsRepository.save({
        ...existing,
        fileId: file.id,
        version: existing.version + 1,
        processingStatus: 'pending' as const,
        errorMessage: null,
      })
      : await this.documentsRepository.save(
        this.documentsRepository.create({
          courseId,
          sectionId,
          lessonId,
          uploadedBy: teacherId,
          fileId: file.id,
          fileName: originalName,
          fileType: 'pdf',
          processingStatus: 'pending',
          checksum,
          version: 1,
        }),
      );

    await this.jobQueue.enqueueDocumentIngestion(document.id, document.version);

    return {
      id: document.id,
      fileName: document.fileName,
      processingStatus: document.processingStatus,
      version: document.version,
    };
  }

  async listCourseDocuments(
    courseId: string,
    teacherId: string,
  ): Promise<CourseDocumentResponse[]> {
    await this.assertTeacherOwnsCourse(courseId, teacherId);

    const documents = await this.documentsRepository.find({
      where: { courseId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      processingStatus: document.processingStatus,
      version: document.version,
      createdAt: document.createdAt.toISOString(),
      errorMessage: document.errorMessage,
    }));
  }

  async retryDocument(
    documentId: string,
    teacherId: string,
  ): Promise<RetryDocumentResponse> {
    const document = await this.documentsRepository.findOne({
      where: { id: documentId, deletedAt: IsNull() },
    });
    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    await this.assertTeacherOwnsCourse(document.courseId, teacherId);

    if (document.processingStatus !== 'failed') {
      throw new ConflictException('Only a failed document can be retried.');
    }

    const saved = await this.documentsRepository.save({
      ...document,
      processingStatus: 'pending' as const,
      errorMessage: null,
    });

    await this.jobQueue.enqueueDocumentIngestion(saved.id, saved.version);

    return { id: saved.id, processingStatus: saved.processingStatus };
  }

  async listStudentDocuments(
    courseId: string,
    studentId: string,
  ): Promise<StudentDocumentResponse[]> {
    await this.enrollmentsService.assertStudentEnrolled(studentId, courseId);

    // Only 'completed' — a student has no business seeing a document that's
    // still processing or that failed; those aren't real content yet.
    const documents = await this.documentsRepository.find({
      where: { courseId, processingStatus: 'completed', deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      createdAt: document.createdAt.toISOString(),
    }));
  }

  async getFileForStudentDownload(
    documentId: string,
    studentId: string,
  ): Promise<StudentDocumentFile> {
    const document = await this.documentsRepository.findOne({
      where: { id: documentId, deletedAt: IsNull() },
    });
    if (!document || document.processingStatus !== 'completed') {
      // Same 404 whether the row is missing or just not ready yet — a
      // student has no legitimate reason to distinguish the two cases.
      throw new NotFoundException('Document not found.');
    }

    await this.enrollmentsService.assertStudentEnrolled(
      studentId,
      document.courseId,
    );

    if (!document.fileId) {
      throw new NotFoundException('Document not found.');
    }

    const file = await this.filesRepository.findOne({
      where: { id: document.fileId },
    });
    if (!file) {
      throw new NotFoundException('Document not found.');
    }
    const buffer = await this.storageAdapter.read(file.storagePath);
    return { buffer, mimeType: file.mimeType, fileName: document.fileName };
  }

  // A lesson's section is authoritative if both are given — lessonId wins
  // and its parent sectionId is derived, so the two can never disagree.
  private async resolvePlacement(
    courseId: string,
    sectionId: string | undefined,
    lessonId: string | undefined,
  ): Promise<{ sectionId: string | null; lessonId: string | null }> {
    if (lessonId) {
      const lesson = await this.lessonsRepository.findOne({
        where: { id: lessonId, courseId, deletedAt: IsNull() },
      });
      if (!lesson) {
        throw new NotFoundException('Lesson not found in this course.');
      }
      return { sectionId: lesson.sectionId, lessonId: lesson.id };
    }

    if (sectionId) {
      const section = await this.sectionsRepository.findOne({
        where: { id: sectionId, courseId, deletedAt: IsNull() },
      });
      if (!section) {
        throw new NotFoundException('Section not found in this course.');
      }
      return { sectionId: section.id, lessonId: null };
    }

    return { sectionId: null, lessonId: null };
  }

  private async assertTeacherOwnsCourse(
    courseId: string,
    teacherId: string,
  ): Promise<CourseEntity> {
    const course = await this.coursesRepository.findOne({
      where: { id: courseId, deletedAt: IsNull() },
    });
    if (!course) {
      throw new NotFoundException('Course not found.');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this course.');
    }
    return course;
  }

  // Never trust the extension or the client's Content-Type: the
  // declared MIME must say PDF *and* the file must actually start with
  // the PDF magic bytes.
  private assertValidPdf(upload: UploadDocumentDto): void {
    const hasPdfMagicBytes = upload.buffer
      .subarray(0, PDF_MAGIC_BYTES.length)
      .equals(PDF_MAGIC_BYTES);

    if (upload.mimeType !== 'application/pdf' || !hasPdfMagicBytes) {
      throw new BadRequestException('الملف المرفوع يجب أن يكون ملف PDF صالح.');
    }
  }

  private assertWithinSizeLimit(sizeBytes: number): void {
    const maxBytes = Number(
      process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES,
    );
    if (sizeBytes > maxBytes) {
      throw new PayloadTooLargeException(
        'حجم الملف يتجاوز الحد الأقصى المسموح به.',
      );
    }
  }

  private assertNonEmpty(sizeBytes: number): void {
    if (sizeBytes <= 0) {
      throw new BadRequestException('لا يمكن رفع ملف فارغ.');
    }
  }

  private normalizeOriginalName(originalName: string): string {
    const decodedName = Buffer.from(originalName, 'latin1').toString('utf8');
    if (
      decodedName !== originalName &&
      ARABIC_TEXT_PATTERN.test(decodedName) &&
      !decodedName.includes('\uFFFD')
    ) {
      return decodedName;
    }

    return originalName;
  }
}
