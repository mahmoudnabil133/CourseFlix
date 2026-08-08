import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DocumentEntity } from '../../documents/entities/document.entity';
import { FileEntity } from '../../documents/entities/file.entity';
import { STORAGE_ADAPTER } from '../../documents/storage/local-storage.adapter';
import { CourseEntity } from '../../courses/entities/course.entity';
import { AdminDocumentsService } from './admin-documents.service';

describe('AdminDocumentsService', () => {
  let service: AdminDocumentsService;
  let documentsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
  };
  let filesRepository: { findOne: jest.Mock };
  let coursesRepository: { find: jest.Mock };
  let storageAdapter: { save: jest.Mock; read: jest.Mock };

  const documentId = 'document-1';
  const courseId = 'course-1';

  beforeEach(async () => {
    documentsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
    };
    filesRepository = { findOne: jest.fn() };
    coursesRepository = { find: jest.fn().mockResolvedValue([]) };
    storageAdapter = { save: jest.fn(), read: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminDocumentsService,
        {
          provide: getRepositoryToken(DocumentEntity),
          useValue: documentsRepository,
        },
        {
          provide: getRepositoryToken(FileEntity),
          useValue: filesRepository,
        },
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: coursesRepository,
        },
        { provide: STORAGE_ADAPTER, useValue: storageAdapter },
      ],
    }).compile();

    service = moduleRef.get(AdminDocumentsService);
  });

  it('resolves the course title for each listed document', async () => {
    documentsRepository.find.mockResolvedValue([
      {
        id: documentId,
        fileName: 'chapter-1.pdf',
        courseId,
        processingStatus: 'completed',
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        errorMessage: null,
      },
    ]);
    coursesRepository.find.mockResolvedValue([
      { id: courseId, title: 'الفيزياء' },
    ]);

    const result = await service.listDocuments({});

    expect(result[0].courseTitle).toBe('الفيزياء');
  });

  it('soft-removes an existing document', async () => {
    const document = { id: documentId, deletedAt: null };
    documentsRepository.findOne.mockResolvedValue(document);

    await service.deleteDocument(documentId);

    expect(documentsRepository.softRemove).toHaveBeenCalledWith(document);
  });

  it('throws NotFoundException for a missing document', async () => {
    documentsRepository.findOne.mockResolvedValue(null);
    await expect(service.deleteDocument('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('getFileForDownload', () => {
    it('reads the underlying file via the storage adapter', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        fileId: 'file-1',
        deletedAt: null,
      });
      filesRepository.findOne.mockResolvedValue({
        id: 'file-1',
        fileName: 'chapter-1.pdf',
        mimeType: 'application/pdf',
        storagePath: '/storage/abc',
      });
      storageAdapter.read.mockResolvedValue(Buffer.from('pdf bytes'));

      const result = await service.getFileForDownload(documentId);

      expect(storageAdapter.read).toHaveBeenCalledWith('/storage/abc');
      expect(result.fileName).toBe('chapter-1.pdf');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('throws NotFoundException when the document has no linked file', async () => {
      documentsRepository.findOne.mockResolvedValue({
        id: documentId,
        fileId: null,
      });
      await expect(service.getFileForDownload(documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the document row is missing', async () => {
      documentsRepository.findOne.mockResolvedValue(null);
      await expect(service.getFileForDownload('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
