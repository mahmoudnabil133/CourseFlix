import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import {
  looksLikeUuid,
  watermarkSqlExpression,
} from '../../common/utils/watermark-id.util';
import {
  NOTIFICATION_PRODUCER_PORT,
  type NotificationProducerPort,
} from '../../common/ports/notification-producer.port';
import { OrderItemEntity } from '../commerce/entities/order-item.entity';
import { OrderEntity } from '../commerce/entities/order.entity';
import { CoursesService } from '../courses/courses.service';
import { CourseEntity, CourseStatus } from '../courses/entities/course.entity';
import type { SectionEntity } from '../courses/entities/section.entity';
import type { LessonEntity } from '../courses/entities/lesson.entity';
import { UserEntity } from '../users/entities/user.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import {
  EnrollmentEntity,
  EnrollmentStatus,
} from '../enrollments/entities/enrollment.entity';
import {
  LessonsService,
  type LessonDetailResponse,
} from '../lessons/lessons.service';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateCourseDto } from '../courses/dto/create-course.dto';
import { CreateSectionDto } from '../courses/dto/create-section.dto';
import { UpdateSectionDto } from '../courses/dto/update-section.dto';
import { CreateLessonDto } from '../courses/dto/create-lesson.dto';
import { UpdateLessonDto } from '../courses/dto/update-lesson.dto';
import { ReorderDto } from '../courses/dto/reorder.dto';

export interface TeacherCourseListItem {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  gradeLevel: string | null;
  status: CourseStatus;
}

export interface TeacherDashboardResponse {
  teacher: { id: string };
  stats: {
    ownedCourseCount: number;
    publishedCourseCount: number;
    enrolledStudentCount: number;
  };
  recentCourses: Array<{ id: string; title: string; status: CourseStatus }>;
}

export interface TeacherStudentCourseSubscription {
  id: string;
  title: string;
  status: CourseStatus;
  enrollmentStatus: EnrollmentStatus;
  enrolledAt: string;
  revenueMinor: number;
}

export interface TeacherStudentListItem {
  id: string;
  fullName: string;
  email: string;
  status: UserEntity['status'];
  joinedAt: string;
  lastLoginAt: string | null;
  isSubscribedToAnyCourse: boolean;
  totalRevenueMinor: number;
  courses: TeacherStudentCourseSubscription[];
}

export interface TeacherStudentsResponse {
  currency: string;
  totals: {
    studentCount: number;
    subscribedStudentCount: number;
    unsubscribedStudentCount: number;
    revenueMinor: number;
  };
  students: TeacherStudentListItem[];
}

interface TeacherStudentRevenueRow {
  studentId: string;
  courseId: string;
  revenueMinor: string;
}

const VALID_COURSE_STATUSES: readonly CourseStatus[] = [
  'draft',
  'published',
  'archived',
];

function parseCourseStatus(value?: string): CourseStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!VALID_COURSE_STATUSES.includes(value as CourseStatus)) {
    throw new BadRequestException(
      `Invalid status filter: "${value}". Must be one of ${VALID_COURSE_STATUSES.join(', ')}.`,
    );
  }

  return value as CourseStatus;
}

@Injectable()
export class TeacherService {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly lessonsService: LessonsService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly teacherEnrollmentsRepository: Repository<EnrollmentEntity>,
    @InjectRepository(OrderEntity)
    private readonly teacherOrdersRepository: Repository<OrderEntity>,
    @Inject(NOTIFICATION_PRODUCER_PORT)
    private readonly notificationPort: NotificationProducerPort,
  ) {}

  async getDashboard(teacherId: string): Promise<TeacherDashboardResponse> {
    const courses = await this.coursesService.findOwnedCourses(teacherId);
    const enrolledStudentCount =
      await this.enrollmentsService.countActiveStudentsByCourseIds(
        courses.map((course) => course.id),
      );

    return {
      teacher: { id: teacherId },
      stats: {
        ownedCourseCount: courses.length,
        publishedCourseCount: courses.filter(
          (course) => course.status === 'published',
        ).length,
        enrolledStudentCount,
      },
      recentCourses: courses.slice(0, 5).map((course) => ({
        id: course.id,
        title: course.title,
        status: course.status,
      })),
    };
  }

  async getCourses(
    teacherId: string,
    status?: string,
  ): Promise<TeacherCourseListItem[]> {
    const courses = await this.coursesService.findOwnedCourses(
      teacherId,
      parseCourseStatus(status),
    );
    return courses.map((course) => this.toListItem(course));
  }

  async getStudents(
    teacherId: string,
    studentIdSearch?: string,
  ): Promise<TeacherStudentsResponse> {
    const [courses, students] = await Promise.all([
      this.coursesService.findOwnedCourses(teacherId),
      this.findStudents(studentIdSearch),
    ]);

    const courseIds = courses.map((course) => course.id);
    const courseById = new Map(courses.map((course) => [course.id, course]));

    const [enrollments, revenueRows] =
      courseIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.teacherEnrollmentsRepository.find({
              where: { courseId: In(courseIds), deletedAt: IsNull() },
              order: { enrolledAt: 'DESC' },
            }),
            this.getStudentRevenueRows(courseIds),
          ]);

    const enrollmentsByStudent = new Map<string, EnrollmentEntity[]>();
    for (const enrollment of enrollments) {
      enrollmentsByStudent.set(enrollment.studentId, [
        ...(enrollmentsByStudent.get(enrollment.studentId) ?? []),
        enrollment,
      ]);
    }

    const revenueByStudentCourse = new Map<string, number>();
    const revenueByStudent = new Map<string, number>();
    for (const row of revenueRows) {
      const revenueMinor = Number(row.revenueMinor);
      revenueByStudentCourse.set(
        `${row.studentId}:${row.courseId}`,
        revenueMinor,
      );
      revenueByStudent.set(
        row.studentId,
        (revenueByStudent.get(row.studentId) ?? 0) + revenueMinor,
      );
    }

    const items = students.map<TeacherStudentListItem>((student) => {
      const subscriptions = (enrollmentsByStudent.get(student.id) ?? [])
        .map<TeacherStudentCourseSubscription | null>((enrollment) => {
          const course = courseById.get(enrollment.courseId);
          if (!course) return null;

          return {
            id: course.id,
            title: course.title,
            status: course.status,
            enrollmentStatus: enrollment.status,
            enrolledAt: enrollment.enrolledAt.toISOString(),
            revenueMinor:
              revenueByStudentCourse.get(`${student.id}:${course.id}`) ?? 0,
          };
        })
        .filter(
          (subscription): subscription is TeacherStudentCourseSubscription =>
            subscription !== null,
        );

      return {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        status: student.status,
        joinedAt: student.createdAt.toISOString(),
        lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
        isSubscribedToAnyCourse: subscriptions.length > 0,
        totalRevenueMinor: revenueByStudent.get(student.id) ?? 0,
        courses: subscriptions,
      };
    });

    const subscribedStudentCount = items.filter(
      (student) => student.isSubscribedToAnyCourse,
    ).length;

    return {
      currency: 'EGP',
      totals: {
        studentCount: items.length,
        subscribedStudentCount,
        unsubscribedStudentCount: items.length - subscribedStudentCount,
        revenueMinor: items.reduce(
          (sum, student) => sum + student.totalRevenueMinor,
          0,
        ),
      },
      students: items,
    };
  }

  async setStudentEnrollmentStatus(
    teacherId: string,
    studentId: string,
    courseId: string,
    status: 'active' | 'suspended',
    reason?: string,
  ): Promise<{ courseId: string; enrollmentStatus: EnrollmentStatus }> {
    const course = await this.coursesService.findCourseById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found.');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this course.');
    }

    const enrollment = await this.teacherEnrollmentsRepository.findOne({
      where: { studentId, courseId, deletedAt: IsNull() },
    });
    if (!enrollment) {
      throw new NotFoundException(
        'This student is not enrolled in this course.',
      );
    }

    enrollment.status = status;
    enrollment.statusChangedBy = 'teacher';
    enrollment.suspendedAt = status === 'suspended' ? new Date() : null;
    enrollment.suspendedReason =
      status === 'suspended' ? (reason ?? null) : null;
    await this.teacherEnrollmentsRepository.save(enrollment);

    await this.notificationPort.notify({
      userId: studentId,
      type: 'course_update',
      title:
        status === 'suspended'
          ? 'تم إيقاف اشتراكك في الدورة'
          : 'تم إعادة تفعيل اشتراكك في الدورة',
      message:
        status === 'suspended'
          ? `تم إيقاف اشتراكك في "${course.title}"${reason ? `: ${reason}` : '.'}`
          : `تم إعادة تفعيل اشتراكك في "${course.title}".`,
      relatedEntityType: 'course',
      relatedEntityId: courseId,
    });

    return { courseId, enrollmentStatus: enrollment.status };
  }

  async updateCourse(
    courseId: string,
    teacherId: string,
    updateCourseDto: UpdateCourseDto,
  ): Promise<TeacherCourseListItem> {
    const course = await this.coursesService.updateCourseMetadata(
      courseId,
      teacherId,
      updateCourseDto,
    );
    return this.toListItem(course);
  }

  async createCourse(
    teacherId: string,
    dto: CreateCourseDto,
  ): Promise<TeacherCourseListItem> {
    const course = await this.coursesService.createCourse(teacherId, dto);
    return this.toListItem(course);
  }

  async deleteCourse(courseId: string, teacherId: string): Promise<void> {
    await this.coursesService.deleteCourse(courseId, teacherId);
  }

  async createSection(
    courseId: string,
    teacherId: string,
    dto: CreateSectionDto,
  ): Promise<SectionEntity> {
    return this.coursesService.createSection(courseId, teacherId, dto.title);
  }

  async getSection(
    sectionId: string,
    teacherId: string,
  ): Promise<SectionEntity> {
    return this.coursesService.getSection(sectionId, teacherId);
  }

  async updateSection(
    sectionId: string,
    teacherId: string,
    dto: UpdateSectionDto,
  ): Promise<SectionEntity> {
    return this.coursesService.updateSection(sectionId, teacherId, dto);
  }

  async deleteSection(sectionId: string, teacherId: string): Promise<void> {
    await this.coursesService.deleteSection(sectionId, teacherId);
  }

  async reorderSections(
    courseId: string,
    teacherId: string,
    dto: ReorderDto,
  ): Promise<void> {
    await this.coursesService.reorderSections(courseId, teacherId, dto.items);
  }

  async createLesson(
    sectionId: string,
    teacherId: string,
    dto: CreateLessonDto,
  ): Promise<LessonEntity> {
    return this.coursesService.createLesson(sectionId, teacherId, dto);
  }

  async getLesson(lessonId: string, teacherId: string): Promise<LessonEntity> {
    return this.coursesService.getLesson(lessonId, teacherId);
  }

  async getLessonPlayer(
    lessonId: string,
    teacherId: string,
  ): Promise<LessonDetailResponse> {
    return this.lessonsService.getTeacherLessonDetail(lessonId, teacherId);
  }

  async updateLesson(
    lessonId: string,
    teacherId: string,
    dto: UpdateLessonDto,
  ): Promise<LessonEntity> {
    return this.coursesService.updateLesson(lessonId, teacherId, dto);
  }

  async deleteLesson(lessonId: string, teacherId: string): Promise<void> {
    await this.coursesService.deleteLesson(lessonId, teacherId);
  }

  async reorderLessons(
    sectionId: string,
    teacherId: string,
    dto: ReorderDto,
  ): Promise<void> {
    await this.coursesService.reorderLessons(sectionId, teacherId, dto.items);
  }

  // `studentIdSearch` is matched against the student's watermark code
  // (the traceable ID burned into their video playback — see
  // watermark-id.util.ts) and, if it looks like one, their full UUID.
  // Lets a teacher paste the code off a leaked recording straight in.
  private async findStudents(studentIdSearch?: string): Promise<UserEntity[]> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: 'student' })
      .andWhere('user.deleted_at IS NULL');

    const search = studentIdSearch?.trim();
    if (search) {
      query.andWhere(
        new Brackets((sub) => {
          sub.where(`${watermarkSqlExpression('user')} = UPPER(:search)`, {
            search,
          });
          if (looksLikeUuid(search)) {
            sub.orWhere('user.id = :fullId', { fullId: search });
          }
        }),
      );
    }

    return query
      .orderBy('user.full_name', 'ASC')
      .addOrderBy('user.created_at', 'ASC')
      .getMany();
  }

  private toListItem(course: CourseEntity): TeacherCourseListItem {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      coverImageUrl: course.coverImageUrl,
      gradeLevel: course.gradeLevel,
      status: course.status,
    };
  }

  private async getStudentRevenueRows(
    courseIds: string[],
  ): Promise<TeacherStudentRevenueRow[]> {
    return this.teacherOrdersRepository
      .createQueryBuilder('order')
      .innerJoin(OrderItemEntity, 'item', 'item.order_id = order.id')
      .where('order.status = :status', { status: 'paid' })
      .andWhere('item.course_id IN (:...courseIds)', { courseIds })
      .select('order.student_id', 'studentId')
      .addSelect('item.course_id', 'courseId')
      .addSelect('SUM(item.price_minor)', 'revenueMinor')
      .groupBy('order.student_id')
      .addGroupBy('item.course_id')
      .getRawMany<TeacherStudentRevenueRow>();
  }
}
