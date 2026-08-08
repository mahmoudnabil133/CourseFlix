import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { CourseEntity } from '../../courses/entities/course.entity';
import { OrderEntity } from '../../commerce/entities/order.entity';
import { InterventionEntity } from '../../interventions/entities/intervention.entity';

export interface AdminAnalyticsOverview {
  users: {
    total: number;
    students: number;
    teachers: number;
    admins: number;
  };
  courses: {
    total: number;
    published: number;
    draft: number;
  };
  commerce: {
    totalOrders: number;
    paidOrders: number;
    revenueMinor: number;
    currency: string;
  };
  interventions: {
    active: number;
  };
}

// Platform-wide aggregate counts, computed directly rather than through
// AnalyticsFunctionsService's intent handlers — those are built around a
// single teacher's owned-course scope for the chat-based assistant, not
// an unscoped platform total, so reusing them would mean threading a
// fake "owns everything" teacher through code that assumes real
// ownership. Direct repository counts are the simpler, correct fit here.
@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    @InjectRepository(InterventionEntity)
    private readonly interventionsRepository: Repository<InterventionEntity>,
  ) {}

  async getOverview(): Promise<AdminAnalyticsOverview> {
    const [
      totalUsers,
      students,
      teachers,
      admins,
      totalCourses,
      publishedCourses,
      draftCourses,
      totalOrders,
      paidOrders,
      revenueRow,
      activeInterventions,
    ] = await Promise.all([
      this.usersRepository.count({ where: { deletedAt: IsNull() } }),
      this.usersRepository.count({
        where: { role: 'student', deletedAt: IsNull() },
      }),
      this.usersRepository.count({
        where: { role: 'teacher', deletedAt: IsNull() },
      }),
      this.usersRepository.count({
        where: { role: 'admin', deletedAt: IsNull() },
      }),
      this.coursesRepository.count({ where: { deletedAt: IsNull() } }),
      this.coursesRepository.count({
        where: { status: 'published', deletedAt: IsNull() },
      }),
      this.coursesRepository.count({
        where: { status: 'draft', deletedAt: IsNull() },
      }),
      this.ordersRepository.count(),
      this.ordersRepository.count({ where: { status: 'paid' } }),
      this.ordersRepository
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.total_minor), 0)', 'total')
        .where('order.status = :status', { status: 'paid' })
        .getRawOne<{ total: string }>(),
      this.interventionsRepository.count({ where: { status: 'active' } }),
    ]);

    return {
      users: { total: totalUsers, students, teachers, admins },
      courses: {
        total: totalCourses,
        published: publishedCourses,
        draft: draftCourses,
      },
      commerce: {
        totalOrders,
        paidOrders,
        revenueMinor: Number(revenueRow?.total ?? 0),
        currency: 'EGP',
      },
      interventions: { active: activeInterventions },
    };
  }
}
