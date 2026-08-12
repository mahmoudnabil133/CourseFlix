import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { COURSE_PRICE_MINOR } from '../src/modules/commerce/commerce.constants';
import { OrderItemEntity } from '../src/modules/commerce/entities/order-item.entity';
import { OrderEntity } from '../src/modules/commerce/entities/order.entity';
import { PaymentEntity } from '../src/modules/commerce/entities/payment.entity';
import { CourseEntity } from '../src/modules/courses/entities/course.entity';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { seedCourse } from '../src/database/seeds/course.seed';
import { seedUsers } from '../src/database/seeds/user.seed';

const MIN_DATE = new Date(0);
const MAX_DATE = new Date(8640000000000000);

/**
 * CF-TASK-065 / CF-TASK-068 (sprint3-plan.md §5 A-4/A-5, CF-US-016).
 * Verifies the teacher sales summary against an independent raw-SQL
 * ledger query (a different code path than SalesService), so the test is
 * a true reconciliation: response totals must exactly match the order
 * rows. Also covers ownership isolation (a course owned by someone else
 * is never counted), range validation, and exclusion of failed/declined
 * orders.
 *
 * The suite tolerates whatever paid orders other e2e suites created by
 * comparing against the live ledger rather than a hardcoded fixture.
 */
describe('Sales (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let teacherAId: string;
  // Not a second teacher account — the platform now enforces exactly one
  // (ux_users_single_teacher). This is a throwaway non-teacher user that
  // only exists to own courseB2, so the isolation test below still has
  // "someone else's course" to check the summary never leaks.
  let otherOwnerId: string;
  let courseA2: CourseEntity;
  let courseB2: CourseEntity;
  let teacherACourseIds: string[];
  let primaryStudentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    const { teacher, student } = await seedUsers(dataSource);
    const { courses } = await seedCourse(dataSource, teacher.id);

    teacherAId = teacher.id;
    primaryStudentId = student.id;
    teacherACourseIds = courses
      .filter((c) => c.teacherId === teacherAId)
      .map((c) => c.id);

    const usersRepo = dataSource.getRepository(UserEntity);
    const otherOwner = await usersRepo.save(
      usersRepo.create({
        fullName: 'Sales E2E Other Owner',
        email: `sales-e2e-other-owner-${Date.now()}@courseflix.local`,
        passwordHash: 'not-a-real-login',
        role: 'student',
        status: 'active',
      }),
    );
    otherOwnerId = otherOwner.id;

    // Fresh courses so this suite's fixtures are never affected by other
    // suites' demo orders.
    const courseRepo = dataSource.getRepository(CourseEntity);
    courseA2 = await courseRepo.save(
      courseRepo.create({
        teacherId: teacherAId,
        title: 'Commerce API Testing',
        slug: `sales-e2e-a-${Date.now()}`,
        description: null,
        coverImageUrl: null,
        gradeLevel: 'الصف الثالث الثانوي',
        status: 'published',
      }),
    );
    courseB2 = await courseRepo.save(
      courseRepo.create({
        teacherId: otherOwnerId,
        title: 'Commerce API Testing B',
        slug: `sales-e2e-b-${Date.now()}`,
        description: null,
        coverImageUrl: null,
        gradeLevel: 'الصف الثالث الثانوي',
        status: 'published',
      }),
    );
    teacherACourseIds.push(courseA2.id);
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginTeacher(agent: ReturnType<typeof request.agent>) {
    await agent
      .post('/api/v1/auth/login')
      .send({
        email: process.env.SEED_TEACHER_EMAIL,
        password: process.env.SEED_TEACHER_PASSWORD,
      })
      .expect(200);
  }

  async function ledgerForCourses(
    courseIds: string[],
    from: Date,
    to: Date,
  ): Promise<{ revenue: number; orders: number }> {
    const rows = await dataSource.query<
      Array<{ revenue: string; orders: string }>
    >(
      `SELECT COALESCE(SUM(oi.price_minor)::bigint, 0) AS revenue,
              COUNT(DISTINCT o.id) AS orders
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status = 'paid'
         AND oi.course_id = ANY($1)
         AND o.paid_at >= $2
         AND o.paid_at < $3`,
      [courseIds, from, to],
    );
    return { revenue: Number(rows[0].revenue), orders: Number(rows[0].orders) };
  }

  async function insertPaidOrder(
    course: CourseEntity,
    paidAt: Date,
  ): Promise<void> {
    const orderRepo = dataSource.getRepository(OrderEntity);
    const itemRepo = dataSource.getRepository(OrderItemEntity);
    const paymentRepo = dataSource.getRepository(PaymentEntity);

    const order = await orderRepo.save(
      orderRepo.create({
        studentId: primaryStudentId,
        status: 'paid',
        paymentStatus: 'paid',
        currency: 'EGP',
        totalMinor: COURSE_PRICE_MINOR,
        idempotencyKey: null,
        paidAt,
      }),
    );
    await itemRepo.save(
      itemRepo.create({
        orderId: order.id,
        courseId: course.id,
        titleSnapshot: course.title,
        priceMinor: COURSE_PRICE_MINOR,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        orderId: order.id,
        attemptNo: 1,
        status: 'paid',
        method: 'test_adapter',
        externalRef: 'test-ok',
      }),
    );
  }

  async function insertDeclinedOrder(course: CourseEntity): Promise<void> {
    const orderRepo = dataSource.getRepository(OrderEntity);
    const itemRepo = dataSource.getRepository(OrderItemEntity);
    const paymentRepo = dataSource.getRepository(PaymentEntity);

    const order = await orderRepo.save(
      orderRepo.create({
        studentId: primaryStudentId,
        status: 'pending',
        paymentStatus: 'failed',
        currency: 'EGP',
        totalMinor: COURSE_PRICE_MINOR,
        idempotencyKey: null,
        paidAt: null,
      }),
    );
    await itemRepo.save(
      itemRepo.create({
        orderId: order.id,
        courseId: course.id,
        titleSnapshot: course.title,
        priceMinor: COURSE_PRICE_MINOR,
      }),
    );
    await paymentRepo.save(
      paymentRepo.create({
        orderId: order.id,
        attemptNo: 1,
        status: 'failed',
        method: 'test_adapter',
        externalRef: 'test-declined',
      }),
    );
  }

  async function getSummary(
    agent: ReturnType<typeof request.agent>,
    query: Record<string, string> = {},
  ): Promise<{
    currency: string;
    revenueMinor: number;
    ordersCount: number;
    bestSeller: {
      courseId: string;
      ordersCount: number;
      revenueMinor: number;
    } | null;
  }> {
    const response = await agent
      .get('/api/v1/teacher/sales/summary')
      .query(query)
      .expect(200);
    return response.body as {
      currency: string;
      revenueMinor: number;
      ordersCount: number;
      bestSeller: {
        courseId: string;
        ordersCount: number;
        revenueMinor: number;
      } | null;
    };
  }

  it('reconciles revenue and order count exactly against the ledger', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginTeacher(agent);

    await insertPaidOrder(courseA2, new Date());
    await insertPaidOrder(courseA2, new Date());

    const expected = await ledgerForCourses(
      teacherACourseIds,
      MIN_DATE,
      MAX_DATE,
    );
    const summary = await getSummary(agent);

    expect(summary.revenueMinor).toBe(expected.revenue);
    expect(summary.ordersCount).toBe(expected.orders);
    expect(summary.currency).toBe('EGP');
  });

  it("never includes another owner's course in the summary", async () => {
    const agentA = request.agent(app.getHttpServer());
    await loginTeacher(agentA);

    const before = await getSummary(agentA);

    await insertPaidOrder(courseB2, new Date());

    const after = await getSummary(agentA);
    expect(after.revenueMinor).toBe(before.revenueMinor);
    expect(after.ordersCount).toBe(before.ordersCount);
  });

  it('excludes failed and declined orders from revenue', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginTeacher(agent);

    const before = await getSummary(agent);

    await insertDeclinedOrder(courseA2);

    const after = await getSummary(agent);
    expect(after.revenueMinor).toBe(before.revenueMinor);
    expect(after.ordersCount).toBe(before.ordersCount);
  });

  it('reports the best-selling course from paid orders', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginTeacher(agent);

    const summary = await getSummary(agent);

    expect(summary.bestSeller).not.toBeNull();
    expect(summary.bestSeller?.courseId).toBe(courseA2.id);
    expect(summary.bestSeller?.ordersCount).toBe(2);
    expect(summary.bestSeller?.revenueMinor).toBe(COURSE_PRICE_MINOR * 2);
  });

  it('respects the half-open date range [from, to)', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginTeacher(agent);

    const now = new Date();
    const expected = await ledgerForCourses(
      teacherACourseIds,
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() + 60_000),
    );

    const summary = await getSummary(agent, {
      from: new Date(now.getTime() - 60_000).toISOString(),
      to: new Date(now.getTime() + 60_000).toISOString(),
    });

    expect(summary.revenueMinor).toBe(expected.revenue);
    expect(summary.ordersCount).toBe(expected.orders);
  });

  it('rejects an invalid date range', async () => {
    const agent = request.agent(app.getHttpServer());
    await loginTeacher(agent);

    await agent
      .get('/api/v1/teacher/sales/summary')
      .query({
        from: '2026-08-06T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('blocks a student from the teacher sales endpoint', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({
        email: process.env.SEED_STUDENT_EMAIL,
        password: process.env.SEED_STUDENT_PASSWORD,
      })
      .expect(200);

    await agent.get('/api/v1/teacher/sales/summary').expect(403);
  });
});
