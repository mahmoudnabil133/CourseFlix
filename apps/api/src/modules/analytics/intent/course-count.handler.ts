import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from '../../courses/entities/course.entity';
import type {
  AnalyticsIntentContext,
  AnalyticsIntentHandler,
  AnalyticsIntentResult,
} from './analytics-intent-handler.interface';

@Injectable()
export class CourseCountIntentHandler implements AnalyticsIntentHandler {
  readonly name = 'course_count';

  constructor(
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
  ) {}

  async handle(
    context: AnalyticsIntentContext,
  ): Promise<AnalyticsIntentResult> {
    const rows = await this.coursesRepository
      .createQueryBuilder('course')
      .select('course.status', 'status')
      .addSelect('COUNT(course.id)', 'count')
      .where('course.teacher_id = :teacherId', {
        teacherId: context.teacherId,
      })
      .andWhere('course.deleted_at IS NULL')
      .groupBy('course.status')
      .getRawMany();

    const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
    const publishedCourses = counts.get('published') ?? 0;
    const draftCourses = counts.get('draft') ?? 0;
    const archivedCourses = counts.get('archived') ?? 0;

    return {
      intent: this.name,
      totalCourses: publishedCourses + draftCourses + archivedCourses,
      publishedCourses,
      draftCourses,
      archivedCourses,
      dateRange: { from: null, to: null },
      rowCount: rows.length,
    };
  }
}
