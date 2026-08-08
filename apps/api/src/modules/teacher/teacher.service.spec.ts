import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../commerce/entities/order.entity';
import { CoursesService } from '../courses/courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { EnrollmentEntity } from '../enrollments/entities/enrollment.entity';
import { LessonsService } from '../lessons/lessons.service';
import { UserEntity } from '../users/entities/user.entity';
import { TeacherService } from './teacher.service';

describe('TeacherService', () => {
  let teacherService: TeacherService;
  let coursesService: {
    findOwnedCourses: jest.Mock;
    updateCourseMetadata: jest.Mock;
  };
  let enrollmentsService: { countActiveStudentsByCourseIds: jest.Mock };
  let lessonsService: { getTeacherLessonDetail: jest.Mock };
  let usersRepository: { createQueryBuilder: jest.Mock };
  let usersQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getMany: jest.Mock;
  };
  let teacherEnrollmentsRepository: { find: jest.Mock };
  let teacherOrdersRepository: { createQueryBuilder: jest.Mock };

  const teacherId = 'teacher-1';

  const courses = [
    {
      id: 'course-1',
      title: 'الميكانيكا الكلاسيكية',
      description: null,
      coverImageUrl: null,
      gradeLevel: 'الصف الأول الثانوي',
      status: 'published',
    },
    {
      id: 'course-2',
      title: 'الكهرومغناطيسية',
      description: null,
      coverImageUrl: null,
      gradeLevel: 'الصف الثالث الثانوي',
      status: 'draft',
    },
  ];

  beforeEach(async () => {
    coursesService = {
      findOwnedCourses: jest.fn(),
      updateCourseMetadata: jest.fn(),
    };
    enrollmentsService = { countActiveStudentsByCourseIds: jest.fn() };
    lessonsService = { getTeacherLessonDetail: jest.fn() };
    usersQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    usersRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(usersQueryBuilder),
    };
    teacherEnrollmentsRepository = { find: jest.fn() };
    teacherOrdersRepository = { createQueryBuilder: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TeacherService,
        { provide: CoursesService, useValue: coursesService },
        { provide: EnrollmentsService, useValue: enrollmentsService },
        { provide: LessonsService, useValue: lessonsService },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        {
          provide: getRepositoryToken(EnrollmentEntity),
          useValue: teacherEnrollmentsRepository,
        },
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: teacherOrdersRepository,
        },
      ],
    }).compile();

    teacherService = moduleRef.get(TeacherService);
  });

  describe('getDashboard', () => {
    it('summarizes owned/published course counts and enrolled students', async () => {
      coursesService.findOwnedCourses.mockResolvedValue(courses);
      enrollmentsService.countActiveStudentsByCourseIds.mockResolvedValue(12);

      const result = await teacherService.getDashboard(teacherId);

      expect(coursesService.findOwnedCourses).toHaveBeenCalledWith(teacherId);
      expect(
        enrollmentsService.countActiveStudentsByCourseIds,
      ).toHaveBeenCalledWith(['course-1', 'course-2']);
      expect(result.stats).toEqual({
        ownedCourseCount: 2,
        publishedCourseCount: 1,
        enrolledStudentCount: 12,
      });
      expect(result.recentCourses).toHaveLength(2);
    });
  });

  describe('getCourses', () => {
    it('passes an undefined status through untouched', async () => {
      coursesService.findOwnedCourses.mockResolvedValue(courses);

      await teacherService.getCourses(teacherId);

      expect(coursesService.findOwnedCourses).toHaveBeenCalledWith(
        teacherId,
        undefined,
      );
    });

    it('validates the status filter and rejects garbage input', async () => {
      await expect(
        teacherService.getCourses(teacherId, 'not-a-status'),
      ).rejects.toThrow(BadRequestException);
      expect(coursesService.findOwnedCourses).not.toHaveBeenCalled();
    });

    it('accepts a valid status filter', async () => {
      coursesService.findOwnedCourses.mockResolvedValue([courses[0]]);

      await teacherService.getCourses(teacherId, 'published');

      expect(coursesService.findOwnedCourses).toHaveBeenCalledWith(
        teacherId,
        'published',
      );
    });
  });

  describe('getStudents', () => {
    it('lists all platform students with their teacher-course subscriptions and revenue', async () => {
      coursesService.findOwnedCourses.mockResolvedValue(courses);
      usersQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'student-1',
          fullName: 'طالب مشترك',
          email: 'subscribed@example.com',
          status: 'active',
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          lastLoginAt: null,
        },
        {
          id: 'student-2',
          fullName: 'طالب غير مشترك',
          email: 'unsubscribed@example.com',
          status: 'active',
          createdAt: new Date('2026-08-01T11:00:00.000Z'),
          lastLoginAt: new Date('2026-08-03T11:00:00.000Z'),
        },
      ]);
      teacherEnrollmentsRepository.find.mockResolvedValue([
        {
          studentId: 'student-1',
          courseId: 'course-1',
          status: 'active',
          enrolledAt: new Date('2026-08-02T10:00:00.000Z'),
        },
      ]);

      const queryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            studentId: 'student-1',
            courseId: 'course-1',
            revenueMinor: '50000',
          },
        ]),
      };
      teacherOrdersRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await teacherService.getStudents(teacherId);

      expect(usersRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(usersQueryBuilder.where).toHaveBeenCalledWith(
        'user.role = :role',
        { role: 'student' },
      );
      expect(usersQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.deleted_at IS NULL',
      );
      expect(teacherEnrollmentsRepository.find).toHaveBeenCalled();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'item.course_id IN (:...courseIds)',
        { courseIds: ['course-1', 'course-2'] },
      );
      expect(result.totals).toEqual({
        studentCount: 2,
        subscribedStudentCount: 1,
        unsubscribedStudentCount: 1,
        revenueMinor: 50000,
      });
      expect(result.students[0]).toMatchObject({
        id: 'student-1',
        isSubscribedToAnyCourse: true,
        totalRevenueMinor: 50000,
        courses: [
          {
            id: 'course-1',
            title: 'الميكانيكا الكلاسيكية',
            enrollmentStatus: 'active',
            revenueMinor: 50000,
          },
        ],
      });
      expect(result.students[1]).toMatchObject({
        id: 'student-2',
        isSubscribedToAnyCourse: false,
        totalRevenueMinor: 0,
        courses: [],
      });
    });

    it('filters by the video-watermark ID (or full UUID) when studentId is given', async () => {
      coursesService.findOwnedCourses.mockResolvedValue([]);
      teacherOrdersRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      await teacherService.getStudents(teacherId, '183C1F78A6');

      expect(usersQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.any(Object),
      );
    });

    it('does not add an ID filter when no studentId is given', async () => {
      coursesService.findOwnedCourses.mockResolvedValue([]);

      await teacherService.getStudents(teacherId);

      // Only the deleted_at filter — no second andWhere for an ID search.
      expect(usersQueryBuilder.andWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateCourse', () => {
    it('delegates ownership-checked persistence to CoursesService', async () => {
      coursesService.updateCourseMetadata.mockResolvedValue(courses[0]);

      const result = await teacherService.updateCourse(
        courses[0].id,
        teacherId,
        { title: 'New Title' },
      );

      expect(coursesService.updateCourseMetadata).toHaveBeenCalledWith(
        courses[0].id,
        teacherId,
        { title: 'New Title' },
      );
      expect(result.id).toBe(courses[0].id);
    });
  });
});
