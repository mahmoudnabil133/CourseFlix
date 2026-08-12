import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity } from '../../courses/entities/course.entity';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity';
import type {
  AnalyticsIntentContext,
  AnalyticsIntentHandler,
  AnalyticsIntentResult,
} from './analytics-intent-handler.interface';

@Injectable()
export class StudentCountIntentHandler implements AnalyticsIntentHandler {
  readonly name = 'student_count';

  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepository: Repository<EnrollmentEntity>,
  ) {}

  async handle(
    context: AnalyticsIntentContext,
  ): Promise<AnalyticsIntentResult> {
    const row = await this.enrollmentsRepository
      .createQueryBuilder('enrollment')
      .innerJoin(
        CourseEntity,
        'course',
        'course.id = enrollment.course_id AND course.teacher_id = :teacherId AND course.deleted_at IS NULL',
        { teacherId: context.teacherId },
      )
      .select('COUNT(enrollment.id)', 'enrollmentCount')
      .addSelect('COUNT(DISTINCT enrollment.student_id)', 'activeStudentCount')
      .where('enrollment.status = :status', { status: 'active' })
      .andWhere('enrollment.deleted_at IS NULL')
      .getRawOne();

    return {
      intent: this.name,
      activeStudentCount: Number(row?.activeStudentCount ?? 0),
      enrollmentCount: Number(row?.enrollmentCount ?? 0),
      dateRange: { from: null, to: null },
      rowCount: 1,
    };
  }
}
