import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourseEntity } from '../../courses/entities/course.entity';
import { CoursesService } from '../../courses/courses.service';
import { VideoEntity } from '../../lessons/entities/video.entity';
import { AdminCoursesService } from './admin-courses.service';

describe('AdminCoursesService', () => {
  let service: AdminCoursesService;
  let coursesRepository: { find: jest.Mock };
  let videosRepository: { find: jest.Mock };
  let coursesService: {
    getCourseDetailForAdmin: jest.Mock;
    updateCourseMetadata: jest.Mock;
    deleteCourse: jest.Mock;
    findCourseById: jest.Mock;
  };

  const courseId = 'course-1';
  const teacherId = 'teacher-1';

  beforeEach(async () => {
    coursesRepository = { find: jest.fn() };
    videosRepository = { find: jest.fn().mockResolvedValue([]) };
    coursesService = {
      getCourseDetailForAdmin: jest.fn(),
      updateCourseMetadata: jest.fn(),
      deleteCourse: jest.fn(),
      findCourseById: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminCoursesService,
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: coursesRepository,
        },
        {
          provide: getRepositoryToken(VideoEntity),
          useValue: videosRepository,
        },
        { provide: CoursesService, useValue: coursesService },
      ],
    }).compile();

    service = moduleRef.get(AdminCoursesService);
  });

  describe('listCourses', () => {
    it('maps courses to list items with the teacher name', async () => {
      coursesRepository.find.mockResolvedValue([
        {
          id: courseId,
          title: 'الفيزياء',
          slug: 'physics',
          gradeLevel: 'الصف الثالث الثانوي',
          status: 'published',
          teacherId,
          teacher: { fullName: 'محمد عبدالرحمن' },
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);

      const result = await service.listCourses({});

      expect(result).toEqual([
        {
          id: courseId,
          title: 'الفيزياء',
          slug: 'physics',
          gradeLevel: 'الصف الثالث الثانوي',
          status: 'published',
          teacherId,
          teacherName: 'محمد عبدالرحمن',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('getCourseDetail', () => {
    it('overlays the VideoEntity url — the authoritative playback source — over the legacy lesson.videoUrl', async () => {
      coursesService.getCourseDetailForAdmin.mockResolvedValue({
        id: courseId,
        sections: [
          {
            id: 'section-1',
            lessons: [
              { id: 'lesson-1', videoUrl: null },
              { id: 'lesson-2', videoUrl: null },
            ],
          },
        ],
      });
      videosRepository.find.mockResolvedValue([
        {
          lessonId: 'lesson-1',
          videoUrl: 'https://example.com/real-video.mp4',
        },
      ]);

      const result = await service.getCourseDetail(courseId);

      expect(result.sections[0].lessons[0].videoUrl).toBe(
        'https://example.com/real-video.mp4',
      );
      expect(result.sections[0].lessons[1].videoUrl).toBeNull();
    });

    it('skips the video lookup entirely for a course with no lessons', async () => {
      coursesService.getCourseDetailForAdmin.mockResolvedValue({
        id: courseId,
        sections: [],
      });

      await service.getCourseDetail(courseId);

      expect(videosRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('updateCourse', () => {
    it('resolves the real owning teacherId before delegating to CoursesService', async () => {
      coursesService.findCourseById.mockResolvedValue({
        id: courseId,
        teacherId,
      });
      coursesService.updateCourseMetadata.mockResolvedValue({});
      coursesService.getCourseDetailForAdmin.mockResolvedValue({
        id: courseId,
        sections: [],
      });

      await service.updateCourse(courseId, { title: 'New Title' });

      expect(coursesService.updateCourseMetadata).toHaveBeenCalledWith(
        courseId,
        teacherId,
        { title: 'New Title' },
      );
    });

    it('throws NotFoundException when the course does not exist', async () => {
      coursesService.findCourseById.mockResolvedValue(null);
      await expect(
        service.updateCourse('missing', { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCourse', () => {
    it('resolves the real owning teacherId before delegating the soft delete', async () => {
      coursesService.findCourseById.mockResolvedValue({
        id: courseId,
        teacherId,
      });

      await service.deleteCourse(courseId);

      expect(coursesService.deleteCourse).toHaveBeenCalledWith(
        courseId,
        teacherId,
      );
    });
  });
});
