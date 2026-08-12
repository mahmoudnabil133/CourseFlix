import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { JOB_QUEUE_PORT } from '../../common/ports/job-queue.port';
import { CourseEntity } from '../courses/entities/course.entity';
import { SectionEntity } from '../courses/entities/section.entity';
import { LessonEntity } from '../courses/entities/lesson.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { DocumentsService } from './documents.service';
import { DocumentEntity } from './entities/document.entity';
import { FileEntity } from './entities/file.entity';
import { STORAGE_ADAPTER } from './storage/local-storage.adapter';

const PDF_BUFFER = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('fake pdf body'),
]);
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

describe('DocumentsService', () => {
  let documentsService: DocumentsService;
  let documentsRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let filesRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let coursesRepository: { findOne: jest.Mock };
  let sectionsRepository: { findOne: jest.Mock };
  let lessonsRepository: { findOne: jest.Mock };
  let storageAdapter: { save: jest.Mock; read: jest.Mock };
  let jobQueue: { enqueueDocumentIngestion: jest.Mock };
  let enrollmentsService: { assertStudentEnrolled: jest.Mock };

  const teacherId = 'teacher-1';
  const courseId = 'course-1';
  const course = { id: courseId, teacherId } as CourseEntity;

  beforeEach(async () => {
    documentsRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((input: Partial<DocumentEntity>) => input),
      save: jest.fn((input: Partial<DocumentEntity>) => ({
        id: 'document-1',
        ...input,
      })),
    };
    filesRepository = {
      create: jest.fn((input: Partial<FileEntity>) => input),
      save: jest.fn((input: Partial<FileEntity>) => ({
        id: 'file-1',
        ...input,
      })),
      findOne: jest.fn(),
    };
    coursesRepository = { findOne: jest.fn() };
    sectionsRepository = { findOne: jest.fn() };
    lessonsRepository = { findOne: jest.fn() };
    storageAdapter = {
      save: jest
        .fn()
        .mockResolvedValue({ storageProvider: 'local', storagePath: '/x' }),
      read: jest.fn(),
    };
    jobQueue = {
      enqueueDocumentIngestion: jest.fn().mockResolvedValue('job-1'),
    };
    enrollmentsService = {
      assertStudentEnrolled: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(DocumentEntity),
          useValue: documentsRepository,
        },
        { provide: getRepositoryToken(FileEntity), useValue: filesRepository },
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: coursesRepository,
        },
        {
          provide: getRepositoryToken(SectionEntity),
          useValue: sectionsRepository,
        },
        {
          provide: getRepositoryToken(LessonEntity),
          useValue: lessonsRepository,
        },
        { provide: STORAGE_ADAPTER, useValue: storageAdapter },
        { provide: JOB_QUEUE_PORT, useValue: jobQueue },
        { provide: EnrollmentsService, useValue: enrollmentsService },
      ],
    }).compile();

    documentsService = moduleRef.get(DocumentsService);
  });

  describe('uploadDocument', () => {
    it('rejects a spoofed MIME type (.pdf name, PNG bytes)', async () => {
      await expect(
        documentsService.uploadDocument(courseId, teacherId, {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PNG_BUFFER,
          sizeBytes: PNG_BUFFER.length,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(coursesRepository.findOne).not.toHaveBeenCalled();
      expect(storageAdapter.save).not.toHaveBeenCalled();
    });

    it('rejects a file over MAX_UPLOAD_BYTES', async () => {
      const previous = process.env.MAX_UPLOAD_BYTES;
      process.env.MAX_UPLOAD_BYTES = '10';

      await expect(
        documentsService.uploadDocument(courseId, teacherId, {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PDF_BUFFER,
          sizeBytes: PDF_BUFFER.length,
        }),
      ).rejects.toThrow(PayloadTooLargeException);

      process.env.MAX_UPLOAD_BYTES = previous;
      expect(storageAdapter.save).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      await expect(
        documentsService.uploadDocument(courseId, teacherId, {
          originalName: 'empty.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(0),
          sizeBytes: 0,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(storageAdapter.save).not.toHaveBeenCalled();
    });

    it('rejects a non-owner teacher with 403, not 404 or an empty list', async () => {
      coursesRepository.findOne.mockResolvedValue({
        id: courseId,
        teacherId: 'someone-else',
      });

      await expect(
        documentsService.uploadDocument(courseId, teacherId, {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PDF_BUFFER,
          sizeBytes: PDF_BUFFER.length,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(storageAdapter.save).not.toHaveBeenCalled();
    });

    it('throws 404 when the course does not exist', async () => {
      coursesRepository.findOne.mockResolvedValue(null);

      await expect(
        documentsService.uploadDocument(courseId, teacherId, {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PDF_BUFFER,
          sizeBytes: PDF_BUFFER.length,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a new document on first upload', async () => {
      coursesRepository.findOne.mockResolvedValue(course);
      documentsRepository.findOne.mockResolvedValue(null);

      const result = await documentsService.uploadDocument(
        courseId,
        teacherId,
        {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PDF_BUFFER,
          sizeBytes: PDF_BUFFER.length,
        },
      );

      expect(documentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId,
          version: 1,
          processingStatus: 'pending',
        }),
      );
      expect(jobQueue.enqueueDocumentIngestion).toHaveBeenCalledWith(
        'document-1',
        1,
      );
      expect(result.version).toBe(1);
    });

    it('normalizes Arabic filenames decoded as latin1 by upload middleware', async () => {
      coursesRepository.findOne.mockResolvedValue(course);
      documentsRepository.findOne.mockResolvedValue(null);

      await documentsService.uploadDocument(courseId, teacherId, {
        originalName:
          'Ø§Ù\x84Ù\x83Ù\x87Ø±Ù\x88Ù\x85ØºÙ\x86Ø§Ø·Ù\x8AØ³Ù\x8AØ©.pdf',
        mimeType: 'application/pdf',
        buffer: PDF_BUFFER,
        sizeBytes: PDF_BUFFER.length,
      });

      expect(filesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'الكهرومغناطيسية.pdf',
        }),
      );
      expect(documentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'الكهرومغناطيسية.pdf',
        }),
      );
    });

    it('bumps the version instead of duplicating on a matching checksum', async () => {
      coursesRepository.findOne.mockResolvedValue(course);
      documentsRepository.findOne.mockResolvedValue({
        id: 'document-1',
        courseId,
        version: 1,
        processingStatus: 'failed',
        errorMessage: 'boom',
      });

      const result = await documentsService.uploadDocument(
        courseId,
        teacherId,
        {
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          buffer: PDF_BUFFER,
          sizeBytes: PDF_BUFFER.length,
        },
      );

      expect(documentsRepository.create).not.toHaveBeenCalled();
      expect(documentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          processingStatus: 'pending',
          errorMessage: null,
        }),
      );
      expect(result.version).toBe(2);
    });
  });

  describe('listCourseDocuments', () => {
    it('rejects a non-owner teacher with 403', async () => {
      coursesRepository.findOne.mockResolvedValue({
        id: courseId,
        teacherId: 'someone-else',
      });

      await expect(
        documentsService.listCourseDocuments(courseId, teacherId),
      ).rejects.toThrow(ForbiddenException);

      expect(documentsRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('retryDocument', () => {
    it('rejects retrying a document that is not failed', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: 'document-1',
        courseId,
        processingStatus: 'processing',
      });
      coursesRepository.findOne.mockResolvedValue(course);

      await expect(
        documentsService.retryDocument('document-1', teacherId),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a non-owner teacher with 403', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: 'document-1',
        courseId,
        processingStatus: 'failed',
      });
      coursesRepository.findOne.mockResolvedValue({
        id: courseId,
        teacherId: 'someone-else',
      });

      await expect(
        documentsService.retryDocument('document-1', teacherId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('re-enqueues a failed document and clears the error', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: 'document-1',
        courseId,
        version: 1,
        processingStatus: 'failed',
        errorMessage: 'boom',
      });
      coursesRepository.findOne.mockResolvedValue(course);

      const result = await documentsService.retryDocument(
        'document-1',
        teacherId,
      );

      expect(documentsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          processingStatus: 'pending',
          errorMessage: null,
        }),
      );
      expect(jobQueue.enqueueDocumentIngestion).toHaveBeenCalledWith(
        'document-1',
        1,
      );
      expect(result.processingStatus).toBe('pending');
    });
  });

  describe('listStudentDocuments', () => {
    const studentId = 'student-1';

    it('returns completed documents for an enrolled student', async () => {
      documentsRepository.find.mockResolvedValue([
        {
          id: 'doc-1',
          fileName: 'notes.pdf',
          createdAt: new Date('2025-01-15T12:00:00Z'),
          processingStatus: 'completed',
        },
        {
          id: 'doc-2',
          fileName: 'slides.pdf',
          createdAt: new Date('2025-01-16T12:00:00Z'),
          processingStatus: 'completed',
        },
      ]);

      const result = await documentsService.listStudentDocuments(
        courseId,
        studentId,
      );

      expect(enrollmentsService.assertStudentEnrolled).toHaveBeenCalledWith(
        studentId,
        courseId,
      );
      expect(result).toEqual([
        {
          id: 'doc-1',
          fileName: 'notes.pdf',
          createdAt: '2025-01-15T12:00:00.000Z',
        },
        {
          id: 'doc-2',
          fileName: 'slides.pdf',
          createdAt: '2025-01-16T12:00:00.000Z',
        },
      ]);
    });

    it('rejects a non-enrolled student with ForbiddenException', async () => {
      enrollmentsService.assertStudentEnrolled.mockRejectedValueOnce(
        new ForbiddenException('You are not enrolled in this course.'),
      );

      await expect(
        documentsService.listStudentDocuments(courseId, studentId),
      ).rejects.toThrow(ForbiddenException);

      expect(documentsRepository.find).not.toHaveBeenCalled();
    });

    it('excludes non-completed documents from the list', async () => {
      documentsRepository.find.mockResolvedValue([]);

      const result = await documentsService.listStudentDocuments(
        courseId,
        studentId,
      );

      expect(result).toEqual([]);
      // The repository query itself filters to 'completed' — the mock
      // returns [] to prove no processing/pending/failed docs leak through.
      expect(documentsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            courseId,
            processingStatus: 'completed',
          }),
        }),
      );
    });
  });

  describe('getFileForStudentDownload', () => {
    const studentId = 'student-1';
    const documentId = 'document-1';

    it('streams a completed document for an enrolled student', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        courseId,
        processingStatus: 'completed',
        fileId: 'file-1',
        fileName: 'notes.pdf',
      });
      filesRepository.findOne.mockResolvedValue({
        id: 'file-1',
        storagePath: '/uploads/file-1.pdf',
        mimeType: 'application/pdf',
      });
      storageAdapter.read.mockResolvedValue(Buffer.from('pdf-bytes'));

      const result = await documentsService.getFileForStudentDownload(
        documentId,
        studentId,
      );

      expect(enrollmentsService.assertStudentEnrolled).toHaveBeenCalledWith(
        studentId,
        courseId,
      );
      expect(result).toEqual({
        buffer: Buffer.from('pdf-bytes'),
        mimeType: 'application/pdf',
        fileName: 'notes.pdf',
      });
    });

    it('rejects a non-enrolled student with ForbiddenException', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        courseId,
        processingStatus: 'completed',
        fileId: 'file-1',
        fileName: 'notes.pdf',
      });
      enrollmentsService.assertStudentEnrolled.mockRejectedValueOnce(
        new ForbiddenException('You are not enrolled in this course.'),
      );

      await expect(
        documentsService.getFileForStudentDownload(documentId, studentId),
      ).rejects.toThrow(ForbiddenException);

      expect(storageAdapter.read).not.toHaveBeenCalled();
    });

    it('rejects a non-completed document with NotFoundException', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        courseId,
        processingStatus: 'processing',
        fileId: 'file-1',
        fileName: 'notes.pdf',
      });

      await expect(
        documentsService.getFileForStudentDownload(documentId, studentId),
      ).rejects.toThrow(NotFoundException);

      expect(enrollmentsService.assertStudentEnrolled).not.toHaveBeenCalled();
    });

    it('rejects when document has no fileId with NotFoundException', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        courseId,
        processingStatus: 'completed',
        fileId: null,
        fileName: 'notes.pdf',
      });

      await expect(
        documentsService.getFileForStudentDownload(documentId, studentId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a missing document with NotFoundException', async () => {
      documentsRepository.findOne.mockResolvedValue(null);

      await expect(
        documentsService.getFileForStudentDownload(documentId, studentId),
      ).rejects.toThrow(NotFoundException);

      expect(enrollmentsService.assertStudentEnrolled).not.toHaveBeenCalled();
    });
  });
});
