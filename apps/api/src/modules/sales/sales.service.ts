import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoursesService } from '../courses/courses.service';
import { CourseEntity } from '../courses/entities/course.entity';
import { OrderItemEntity } from '../commerce/entities/order-item.entity';
import { OrderEntity } from '../commerce/entities/order.entity';
import { DISPLAY_TIMEZONE } from '../commerce/commerce.constants';

export interface SalesRange {
  from?: string;
  to?: string;
}

export interface BestSellerResponse {
  courseId: string;
  title: string;
  ordersCount: number;
  revenueMinor: number;
}

export interface SalesSummaryResponse {
  from: string | null;
  to: string | null;
  currency: string;
  timezone: string;
  revenueMinor: number;
  ordersCount: number;
  bestSeller: BestSellerResponse | null;
}

interface SalesRow {
  courseId: string;
  courseTitle: string;
  revenueMinor: string;
  ordersCount: string;
}

const MIN_DATE = new Date(0);
const MAX_DATE = new Date(8640000000000000);
const MAX_BEST_SELLERS = 5;

function parseDate(label: string, value?: string): Date | null {
  if (value === undefined || value === '') {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${label} filter: "${value}".`);
  }
  return parsed;
}

/**
 * Teacher-owned sales aggregates (sprint3-plan.md §5 A-4, CF-TASK-065,
 * CF-US-016). Backend orders are the only revenue truth: this reads the
 * `orders`/`order_items` ledger directly and never recomputes money from
 * the client. Only `paid` orders count — failed, declined and reset rows
 * are excluded by construction.
 *
 * Ownership is enforced by scoping every query to `findOwnedCourses`, so
 * another teacher's revenue can never leak into the result (same posture
 * as AgentLogsService).
 */
@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    private readonly coursesService: CoursesService,
  ) {}

  async getSummary(
    teacherId: string,
    range: SalesRange = {},
  ): Promise<SalesSummaryResponse> {
    const from = parseDate('from', range.from);
    const to = parseDate('to', range.to);
    if (from && to && from.getTime() >= to.getTime()) {
      throw new BadRequestException(
        'Invalid range: "from" must be before "to".',
      );
    }

    const ownedCourses = await this.coursesService.findOwnedCourses(teacherId);
    const ownedCourseIds = ownedCourses.map((course) => course.id);
    if (ownedCourseIds.length === 0) {
      return this.emptySummary(from, to);
    }

    const rows = await this.queryLedger(
      ownedCourseIds,
      from ?? MIN_DATE,
      to ?? MAX_DATE,
    );

    const revenueMinor = rows.reduce(
      (sum, row) => sum + Number(row.revenueMinor),
      0,
    );
    const ordersCount = rows.reduce(
      (sum, row) => sum + Number(row.ordersCount),
      0,
    );
    const bestSeller: BestSellerResponse | null =
      rows.length > 0
        ? {
            courseId: rows[0].courseId,
            title: rows[0].courseTitle,
            ordersCount: Number(rows[0].ordersCount),
            revenueMinor: Number(rows[0].revenueMinor),
          }
        : null;

    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      currency: 'EGP',
      timezone: DISPLAY_TIMEZONE,
      revenueMinor,
      ordersCount,
      bestSeller,
    };
  }

  /**
   * Top selling courses for the same half-open range — the data behind
   * the Analytics Agent's "best-selling courses" intent (CF-TASK-070).
   */
  async getBestSellers(
    teacherId: string,
    range: SalesRange = {},
    limit: number = MAX_BEST_SELLERS,
  ): Promise<BestSellerResponse[]> {
    const from = parseDate('from', range.from);
    const to = parseDate('to', range.to);
    if (from && to && from.getTime() >= to.getTime()) {
      throw new BadRequestException(
        'Invalid range: "from" must be before "to".',
      );
    }

    const ownedCourses = await this.coursesService.findOwnedCourses(teacherId);
    const ownedCourseIds = ownedCourses.map((course) => course.id);
    if (ownedCourseIds.length === 0) {
      return [];
    }

    const rows = await this.queryLedger(
      ownedCourseIds,
      from ?? MIN_DATE,
      to ?? MAX_DATE,
    );

    return rows.slice(0, limit).map((row) => ({
      courseId: row.courseId,
      title: row.courseTitle,
      ordersCount: Number(row.ordersCount),
      revenueMinor: Number(row.revenueMinor),
    }));
  }

  private async queryLedger(
    ownedCourseIds: string[],
    from: Date,
    to: Date,
  ): Promise<SalesRow[]> {
    return this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin(OrderItemEntity, 'item', 'item.order_id = order.id')
      .innerJoin(CourseEntity, 'course', 'course.id = item.course_id')
      .where('order.status = :status', { status: 'paid' })
      .andWhere('item.course_id IN (:...courseIds)', {
        courseIds: ownedCourseIds,
      })
      .andWhere('order.paid_at >= :from', { from })
      .andWhere('order.paid_at < :to', { to })
      .select('item.course_id', 'courseId')
      .addSelect('course.title', 'courseTitle')
      .addSelect('SUM(item.price_minor)', 'revenueMinor')
      .addSelect('COUNT(DISTINCT order.id)', 'ordersCount')
      .groupBy('item.course_id')
      .addGroupBy('course.title')
      .orderBy('"revenueMinor"', 'DESC')
      .getRawMany<SalesRow>();
  }

  private emptySummary(
    from: Date | null,
    to: Date | null,
  ): SalesSummaryResponse {
    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      currency: 'EGP',
      timezone: DISPLAY_TIMEZONE,
      revenueMinor: 0,
      ordersCount: 0,
      bestSeller: null,
    };
  }
}
