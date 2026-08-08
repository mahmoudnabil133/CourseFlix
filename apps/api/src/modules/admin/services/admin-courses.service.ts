import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, IsNull, Repository } from 'typeorm';
import {
  CourseEntity,
  CourseStatus,
} from '../../courses/entities/course.entity';
import {
  CoursesService,
  UpdateCourseFields,
} from '../../courses/courses.service';
import { CourseDetailResponseDto } from '../../courses/dto/course-detail-response.dto';
import { VideoEntity } from '../../lessons/entities/video.entity';
import { ListCoursesQueryDto } from '../dto/list-courses-query.dto';

export interface AdminCourseListItem {
  id: string;
  title: string;
  slug: string;
  gradeLevel: string | null;
  status: CourseStatus;
  teacherId: string;
  teacherName: string;
  createdAt: string;
}

// Same operational-list cap convention as AdminUsersService/AgentLogsService.
const MAX_RESULTS = 200;

@Injectable()
export class AdminCoursesService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>,
    private readonly coursesService: CoursesService,
  ) {}

  async listCourses(
    query: ListCoursesQueryDto,
  ): Promise<AdminCourseListItem[]> {
    const where: Record<string, unknown> = { deletedAt: IsNull() };
    if (query.status) where.status = query.status;
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.search) where.title = ILike(`%${query.search}%`);

    const courses = await this.coursesRepository.find({
      where,
      relations: { teacher: true },
      order: { createdAt: 'DESC' },
      take: MAX_RESULTS,
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      gradeLevel: course.gradeLevel,
      status: course.status,
      teacherId: course.teacherId,
      teacherName: course.teacher?.fullName ?? '—',
      createdAt: course.createdAt.toISOString(),
    }));
  }

  // CourseDetailResponseDto's lesson.videoUrl comes from the legacy
  // lessons.video_url column, which nothing writes for content created
  // via the video seed/ingestion path — VideoEntity is the actual
  // authoritative playback source (see its docblock). Overlay the real
  // URL here so admin content review shows every lesson's true video
  // instead of "no video" for anything not authored through the
  // teacher lesson-editor form specifically.
  async getCourseDetail(courseId: string): Promise<CourseDetailResponseDto> {
    const detail = await this.coursesService.getCourseDetailForAdmin(courseId);

    const lessonIds = detail.sections.flatMap((section) =>
      section.lessons.map((lesson) => lesson.id),
    );
    if (lessonIds.length === 0) {
      return detail;
    }

    const videos = await this.videosRepository.find({
      where: { lessonId: In(lessonIds), deletedAt: IsNull() },
    });
    const videoUrlByLessonId = new Map(
      videos.map((video) => [video.lessonId, video.videoUrl]),
    );

    return {
      ...detail,
      sections: detail.sections.map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) => ({
          ...lesson,
          videoUrl: videoUrlByLessonId.get(lesson.id) ?? lesson.videoUrl,
        })),
      })),
    };
  }

  async updateCourse(
    courseId: string,
    fields: UpdateCourseFields,
  ): Promise<CourseDetailResponseDto> {
    const teacherId = await this.resolveTeacherId(courseId);
    await this.coursesService.updateCourseMetadata(courseId, teacherId, fields);
    return this.getCourseDetail(courseId);
  }

  // Soft delete only — CoursesService.deleteCourse() already uses
  // softRemove() under the hood, so this is reversible and carries no
  // FK-violation risk the way a real DELETE against enrollments/orders
  // referencing this course would.
  async deleteCourse(courseId: string): Promise<void> {
    const teacherId = await this.resolveTeacherId(courseId);
    await this.coursesService.deleteCourse(courseId, teacherId);
  }

  private async resolveTeacherId(courseId: string): Promise<string> {
    const course = await this.coursesService.findCourseById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found.');
    }
    return course.teacherId;
  }
}
