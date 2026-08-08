import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { VideoIngestionService } from '../video-ingestion/video-ingestion.service';
import { CoursesService } from './courses.service';
import { CourseEntity } from './entities/course.entity';
import { SectionEntity } from './entities/section.entity';
import { LessonEntity } from './entities/lesson.entity';
import { VideoEntity } from '../lessons/entities/video.entity';

function viewer(
  overrides: Pick<AuthenticatedUser, 'id' | 'email' | 'role'>,
): AuthenticatedUser {
  return { fullName: 'Test User', avatarUrl: null, ...overrides };
}

describe('CoursesService', () => {
  let coursesService: CoursesService;
  let enrollmentsService: { assertStudentEnrolled: jest.Mock };
  let queryBuilder: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getOne: jest.Mock;
    getMany: jest.Mock;
  };
  let coursesRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let sectionsRepository: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
    update: jest.Mock;
  };
  let lessonsRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
    update: jest.Mock;
  };
  let videosRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    softRemove: jest.Mock;
  };

  const teacher = { id: 'teacher-1', fullName: 'محمد عبدالرحمن' };

  const course = {
    id: 'course-1',
    teacherId: teacher.id,
    title: 'الميكانيكا الكلاسيكية',
    slug: 'classical-mechanics',
    description: null,
    coverImageUrl: null,
    gradeLevel: 'الصف الأول الثانوي',
    status: 'published',
    teacher,
    sections: [],
    deletedAt: null,
  } as unknown as CourseEntity;

  beforeEach(async () => {
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
    };
    coursesRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    sectionsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      }),
      findOne: jest.fn(),
      save: jest.fn(),
      softRemove: jest.fn(),
      update: jest.fn(),
    };
    lessonsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      }),
      create: jest.fn((entity) => entity),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve({ id: 'lesson-1', ...entity })),
      softRemove: jest.fn(),
      update: jest.fn(),
    };
    videosRepository = {
      create: jest.fn((entity) => entity),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve({ id: 'video-1', ...entity })),
      softRemove: jest.fn(),
    };
    enrollmentsService = { assertStudentEnrolled: jest.fn() };
    const videoIngestionService = {
      enqueueForVideo: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CoursesService,
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
        {
          provide: getRepositoryToken(VideoEntity),
          useValue: videosRepository,
        },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: VideoIngestionService, useValue: videoIngestionService },
      ],
    }).compile();

    coursesService = moduleRef.get(CoursesService);
  });

  describe('getCourseDetail', () => {
    it('returns the course for the owning teacher and marks it editable', async () => {
      queryBuilder.getOne.mockResolvedValue(course);

      const result = await coursesService.getCourseDetail(
        course.id,
        viewer({
          id: teacher.id,
          email: 'teacher@courseflix.local',
          role: 'teacher',
        }),
      );

      expect(result.canEdit).toBe(true);
      expect(result.teacher).toEqual({
        id: teacher.id,
        fullName: teacher.fullName,
      });
      expect(enrollmentsService.assertStudentEnrolled).not.toHaveBeenCalled();
    });

    it('rejects a teacher who does not own the course', async () => {
      queryBuilder.getOne.mockResolvedValue(course);

      await expect(
        coursesService.getCourseDetail(
          course.id,
          viewer({
            id: 'someone-else',
            email: 'other@courseflix.local',
            role: 'teacher',
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('checks enrollment for a student viewer and marks it not editable', async () => {
      queryBuilder.getOne.mockResolvedValue(course);
      enrollmentsService.assertStudentEnrolled.mockResolvedValue({});

      const result = await coursesService.getCourseDetail(
        course.id,
        viewer({
          id: 'student-1',
          email: 'student@courseflix.local',
          role: 'student',
        }),
      );

      expect(result.canEdit).toBe(false);
      expect(enrollmentsService.assertStudentEnrolled).toHaveBeenCalledWith(
        'student-1',
        course.id,
      );
    });

    it('propagates the 403 thrown when a student is not enrolled', async () => {
      queryBuilder.getOne.mockResolvedValue(course);
      enrollmentsService.assertStudentEnrolled.mockRejectedValue(
        new ForbiddenException('You are not enrolled in this course.'),
      );

      await expect(
        coursesService.getCourseDetail(
          course.id,
          viewer({
            id: 'student-1',
            email: 'student@courseflix.local',
            role: 'student',
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 404 for a missing course', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await expect(
        coursesService.getCourseDetail(
          'missing',
          viewer({
            id: 'student-1',
            email: 'student@courseflix.local',
            role: 'student',
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCourseMetadata', () => {
    it('persists allowed fields after verifying ownership', async () => {
      coursesRepository.findOne.mockResolvedValue({ ...course });
      coursesRepository.save.mockImplementation(
        (entity: CourseEntity) => entity,
      );

      const result = await coursesService.updateCourseMetadata(
        course.id,
        teacher.id,
        { title: 'New Title' },
      );

      expect(result.title).toBe('New Title');
    });

    it('rejects an update from a non-owning teacher', async () => {
      coursesRepository.findOne.mockResolvedValue({ ...course });

      await expect(
        coursesService.updateCourseMetadata(course.id, 'someone-else', {
          title: 'New Title',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(coursesRepository.save).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing course', async () => {
      coursesRepository.findOne.mockResolvedValue(null);

      await expect(
        coursesService.updateCourseMetadata('missing', teacher.id, {
          title: 'New Title',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('lesson video sync', () => {
    const section = {
      id: 'section-1',
      courseId: course.id,
      status: 'published',
      course,
    } as unknown as SectionEntity;

    it('creates an authoritative video row when a teacher adds a lesson with a YouTube URL', async () => {
      sectionsRepository.findOne.mockResolvedValue(section);
      videosRepository.findOne.mockResolvedValue(null);

      const result = await coursesService.createLesson(section.id, teacher.id, {
        title: 'قانون نيوتن الأول',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });

      expect(result.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
      expect(videosRepository.create).toHaveBeenCalledWith({
        courseId: course.id,
        sectionId: section.id,
        lessonId: 'lesson-1',
        title: 'قانون نيوتن الأول',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        type: 'recorded',
        status: 'recorded',
        durationSeconds: null,
      });
      expect(videosRepository.save).toHaveBeenCalled();
    });

    it('normalizes a Bunny Stream iframe embed when a teacher adds a lesson', async () => {
      sectionsRepository.findOne.mockResolvedValue(section);
      videosRepository.findOne.mockResolvedValue(null);
      const embedCode =
        '<div style="position:relative;padding-top:56.25%;"><iframe src="https://player.mediadelivery.net/embed/663132/b40c3ee1-00ee-4fd8-ab8e-2e0993b11030?autoplay=true&amp;loop=false&amp;muted=true&amp;preload=true&amp;responsive=true" loading="lazy"></iframe></div>';
      const expectedUrl =
        'https://player.mediadelivery.net/embed/663132/b40c3ee1-00ee-4fd8-ab8e-2e0993b11030?autoplay=true&loop=false&muted=true&preload=true&responsive=true';

      const result = await coursesService.createLesson(section.id, teacher.id, {
        title: 'Bunny lesson',
        videoUrl: embedCode,
      });

      expect(result.videoUrl).toBe(expectedUrl);
      expect(videosRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonId: 'lesson-1',
          videoUrl: expectedUrl,
        }),
      );
    });

    it('rejects iframe embeds that are not from Bunny Stream', async () => {
      sectionsRepository.findOne.mockResolvedValue(section);

      await expect(
        coursesService.createLesson(section.id, teacher.id, {
          title: 'Unsafe embed',
          videoUrl: '<iframe src="https://example.com/embed/video"></iframe>',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(lessonsRepository.save).not.toHaveBeenCalled();
    });

    it('updates the video row when a teacher edits the lesson video URL', async () => {
      const lesson = {
        id: 'lesson-1',
        sectionId: section.id,
        courseId: course.id,
        title: 'قانون نيوتن الأول',
        videoUrl: 'https://youtu.be/old-video',
        section,
      } as unknown as LessonEntity;
      const video = {
        id: 'video-1',
        lessonId: lesson.id,
        videoUrl: lesson.videoUrl,
      };
      lessonsRepository.findOne.mockResolvedValue(lesson);
      lessonsRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );
      videosRepository.findOne.mockResolvedValue(video);

      await coursesService.updateLesson(lesson.id, teacher.id, {
        videoUrl: 'https://www.youtube.com/watch?v=newVideo123',
      });

      expect(videosRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'video-1',
          lessonId: lesson.id,
          courseId: course.id,
          sectionId: section.id,
          title: lesson.title,
          videoUrl: 'https://www.youtube.com/watch?v=newVideo123',
          type: 'recorded',
          status: 'recorded',
        }),
      );
    });

    it('removes the video row when a teacher clears the lesson video URL', async () => {
      const lesson = {
        id: 'lesson-1',
        sectionId: section.id,
        courseId: course.id,
        title: 'قانون نيوتن الأول',
        videoUrl: 'https://youtu.be/old-video',
        section,
      } as unknown as LessonEntity;
      const video = { id: 'video-1', lessonId: lesson.id };
      lessonsRepository.findOne.mockResolvedValue(lesson);
      lessonsRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );
      videosRepository.findOne.mockResolvedValue(video);

      await coursesService.updateLesson(lesson.id, teacher.id, {
        videoUrl: null,
      });

      expect(videosRepository.softRemove).toHaveBeenCalledWith(video);
    });
  });
});
