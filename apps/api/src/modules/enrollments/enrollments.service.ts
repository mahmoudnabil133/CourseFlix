import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  EnrollmentEntity,
  EnrollmentStatus,
} from './entities/enrollment.entity';

export interface StudentEnrollmentFilters {
  status?: EnrollmentStatus;
}

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepository: Repository<EnrollmentEntity>,
  ) {}

  async findStudentEnrollments(
    studentId: string,
    filters: StudentEnrollmentFilters = {},
  ): Promise<EnrollmentEntity[]> {
    const query = this.enrollmentsRepository
      .createQueryBuilder('enrollment')
      .where('enrollment.student_id = :studentId', { studentId })
      .andWhere('enrollment.deleted_at IS NULL');

    if (filters.status) {
      query.andWhere('enrollment.status = :status', {
        status: filters.status,
      });
    }

    return query.orderBy('enrollment.enrolled_at', 'DESC').getMany();
  }

  async assertStudentEnrolled(
    studentId: string,
    courseId: string,
  ): Promise<EnrollmentEntity> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: {
        studentId,
        courseId,
        status: 'active',
        deletedAt: IsNull(),
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course.');
    }

    return enrollment;
  }

  async listActiveStudentIds(courseId: string): Promise<string[]> {
    const enrollments = await this.enrollmentsRepository.find({
      where: { courseId, status: 'active', deletedAt: IsNull() },
    });
    return enrollments.map((enrollment) => enrollment.studentId);
  }

  async countActiveStudentsByCourseIds(courseIds: string[]): Promise<number> {
    if (courseIds.length === 0) {
      return 0;
    }

    return this.enrollmentsRepository
      .createQueryBuilder('enrollment')
      .where('enrollment.course_id IN (:...courseIds)', { courseIds })
      .andWhere('enrollment.status = :status', { status: 'active' })
      .andWhere('enrollment.deleted_at IS NULL')
      .getCount();
  }

  async createEnrollment(
    studentId: string,
    courseId: string,
  ): Promise<EnrollmentEntity> {
    const existing = await this.enrollmentsRepository.findOne({
      where: { studentId, courseId, deletedAt: IsNull() },
      withDeleted: false,
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new ConflictException('You are already enrolled in this course.');
      }
      if (existing.status === 'suspended') {
        throw new ForbiddenException('Your enrollment has been suspended.');
      }
      if (existing.status === 'completed') {
        throw new ConflictException('You have already completed this course.');
      }
    }

    const enrollment = this.enrollmentsRepository.create({
      studentId,
      courseId,
      status: 'active',
    });
    return this.enrollmentsRepository.save(enrollment);
  }

  async findEnrollmentById(
    enrollmentId: string,
    studentId: string,
  ): Promise<EnrollmentEntity> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { id: enrollmentId, deletedAt: IsNull() },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found.');
    }
    if (enrollment.studentId !== studentId) {
      throw new ForbiddenException('This is not your enrollment.');
    }
    return enrollment;
  }

  async updateEnrollment(
    enrollmentId: string,
    studentId: string,
    status: EnrollmentStatus,
  ): Promise<EnrollmentEntity> {
    const enrollment = await this.findEnrollmentById(enrollmentId, studentId);
    enrollment.status = status;
    return this.enrollmentsRepository.save(enrollment);
  }

  async deleteEnrollment(
    enrollmentId: string,
    studentId: string,
  ): Promise<void> {
    const enrollment = await this.findEnrollmentById(enrollmentId, studentId);
    enrollment.deletedAt = new Date();
    await this.enrollmentsRepository.save(enrollment);
  }
}
