import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { CoursesService } from '../courses/courses.service';
import { EnrollmentEntity } from '../enrollments/entities/enrollment.entity';
import {
  COURSE_PRICE_MINOR,
  DEFAULT_CURRENCY,
  DISPLAY_TIMEZONE,
} from './commerce.constants';
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity } from './entities/order.entity';
import { PaymentEntity } from './entities/payment.entity';
import {
  PAYMENT_ADAPTER,
  PaymentAdapter,
} from './payments/payment-adapter.interface';

export interface OrderItemResponse {
  courseId: string;
  title: string;
  priceMinor: number;
}

export interface OrderResponse {
  orderReference: string;
  status: OrderEntity['status'];
  paymentStatus: OrderEntity['paymentStatus'];
  currency: string;
  amountMinor: number;
  timezone: string;
  items: OrderItemResponse[];
  createdAt: string;
  paidAt: string | null;
}

/**
 * Test commerce flow (sprint3-plan.md §5, CF-US-015 / CF-TASK-058/059).
 *
 * Backend truth rules, enforced here rather than in the controller so
 * every caller (including future producers) gets the same guarantees:
 *  - price and currency always come from the server (`COURSE_PRICE_MINOR`);
 *  - the client can never set paid status — only the deterministic
 *    adapter outcome drives it;
 *  - confirm runs in one transaction (payment row + order update +
 *    enrollment), guarded by a row lock so concurrent duplicates can
 *    never create two paid orders, two payments, or two enrollments;
 *  - a declined attempt records a failed payment and stays retryable.
 */
@Injectable()
export class CommerceService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemsRepository: Repository<OrderItemEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepository: Repository<PaymentEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepository: Repository<EnrollmentEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly coursesService: CoursesService,
    @Inject(PAYMENT_ADAPTER)
    private readonly paymentAdapter: PaymentAdapter,
  ) {}

  async createDraftOrder(
    studentId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    const course = await this.coursesService.findCourseById(dto.courseId);
    if (!course) {
      throw new NotFoundException('Course not found.');
    }
    if (course.status !== 'published') {
      throw new ConflictException('This course is not available for purchase.');
    }
    // "Already owned" is a first-class checkout state for the UI — reject
    // up front instead of creating a draft that can never be confirmed.
    if (await this.hasActiveEnrollment(studentId, course.id)) {
      throw new ConflictException('You already own this course.');
    }

    if (dto.idempotencyKey) {
      const existing = await this.ordersRepository.findOne({
        where: { studentId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return this.toResponse(existing, await this.loadItems(existing.id));
      }
    }

    const savedOrder = await this.ordersRepository.save(
      this.ordersRepository.create({
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: DEFAULT_CURRENCY,
        totalMinor: COURSE_PRICE_MINOR,
        idempotencyKey: dto.idempotencyKey ?? null,
      }),
    );

    const item = await this.orderItemsRepository.save(
      this.orderItemsRepository.create({
        orderId: savedOrder.id,
        courseId: course.id,
        titleSnapshot: course.title,
        priceMinor: COURSE_PRICE_MINOR,
      }),
    );

    return this.toResponse(savedOrder, [item]);
  }

  async confirmOrder(
    studentId: string,
    orderId: string,
    dto: ConfirmOrderDto,
  ): Promise<OrderResponse> {
    const simulation = dto.simulate ?? 'success';

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(OrderEntity).findOne({
        where: { id: orderId, studentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      // Duplicate confirm (same order, or a retry after success) returns
      // the authoritative paid state and creates nothing new.
      if (order.status === 'paid') {
        return this.toResponse(order, await this.loadItems(order.id));
      }

      const items = await this.loadItems(order.id);
      const attemptNo =
        (await manager
          .getRepository(PaymentEntity)
          .count({ where: { orderId: order.id } })) + 1;

      const result = this.paymentAdapter.process(order, items, simulation);

      await manager.getRepository(PaymentEntity).save(
        manager.getRepository(PaymentEntity).create({
          orderId: order.id,
          attemptNo,
          status: result.status,
          method: this.paymentAdapter.name,
          externalRef: result.externalRef,
        }),
      );

      if (result.status === 'failed') {
        order.paymentStatus = 'failed';
        await manager.getRepository(OrderEntity).save(order);
        return this.toResponse(order, items);
      }

      order.status = 'paid';
      order.paymentStatus = 'paid';
      order.paidAt = new Date();
      await manager.getRepository(OrderEntity).save(order);

      // Enrollment inside the same transaction, so a duplicate confirm can
      // never yield a duplicate enrollment. Already-owned is skipped
      // (idempotent), never re-created or erroring on a paid order.
      await this.ensureEnrollment(manager, studentId, items[0].courseId);

      return this.toResponse(order, items);
    });
  }

  /**
   * Resolves an order for a real (Paymob) payment session: must belong to
   * the authenticated student and not already be paid. Guards the price/paid
   * state exactly like confirmOrder — the client can never pay twice or pay
   * for someone else's order.
   */
  async getPendingPayableOrder(
    studentId: string,
    orderId: string,
  ): Promise<OrderEntity> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, studentId },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    if (order.status === 'paid') {
      throw new ConflictException('This order is already paid.');
    }
    return order;
  }

  /**
   * Records the pending Paymob attempt started by `initiatePaymob`. The
   * attempt stays `pending` until the server-to-server webhook resolves it
   * to `paid` or `failed`, so retries and the GET redirect can both audit
   * the attempt ledger.
   */
  async recordPaymobPaymentAttempt(
    orderId: string,
    paymobOrderId: string,
  ): Promise<void> {
    const attemptNo =
      (await this.paymentsRepository.count({ where: { orderId } })) + 1;
    await this.paymentsRepository.save(
      this.paymentsRepository.create({
        orderId,
        attemptNo,
        status: 'pending',
        method: 'paymob',
        paymobOrderId,
      }),
    );
  }

  /**
   * Maps a Paymob order id (the only identifier the browser GET redirect
   * carries) back to the course id the student paid for.
   */
  async findCourseIdByPaymobOrderId(
    paymobOrderId: string,
  ): Promise<string | null> {
    const payment = await this.paymentsRepository.findOne({
      where: { paymobOrderId, method: 'paymob' },
    });
    if (!payment) {
      return null;
    }
    const items = await this.loadItems(payment.orderId);
    return items[0]?.courseId ?? null;
  }

  /**
   * Authoritative fulfillment driven by Paymob's server-to-server webhook.
   * Runs in one locked transaction: a duplicate or already-processed webhook
   * is a no-op and can never create two payments, two paid orders, or two
   * enrollments — the same guarantee confirmOrder gives the test adapter.
   */
  async fulfillPaymobWebhook(payload: {
    merchantOrderId: string;
    paymobOrderId: string;
    transactionId: string;
    success: boolean;
  }): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(OrderEntity);
      const paymentRepo = manager.getRepository(PaymentEntity);

      const order = await orderRepo.findOne({
        where: { id: payload.merchantOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        // Unknown order id — acknowledge and move on so Paymob doesn't retry
        // forever over a webhook we can never resolve.
        return;
      }
      if (order.status === 'paid') {
        // Duplicate webhook for an already-fulfilled order.
        return;
      }

      const items = await manager
        .getRepository(OrderItemEntity)
        .find({ where: { orderId: order.id }, order: { createdAt: 'ASC' } });

      // Resolve the pending attempt started by initiatePaymob (matched by
      // Paymob's order id), so one Paymob payment = exactly one payment row.
      // A webhook for an order we never initiated falls back to a new row.
      const pendingAttempt = await paymentRepo.findOne({
        where: {
          orderId: order.id,
          method: 'paymob',
          status: 'pending',
          paymobOrderId: payload.paymobOrderId,
        },
        order: { createdAt: 'DESC' },
      });

      const persistAttempt = async () => {
        const attemptNo = pendingAttempt
          ? pendingAttempt.attemptNo
          : (await paymentRepo.count({ where: { orderId: order.id } })) + 1;
        return paymentRepo.save(
          paymentRepo.create({
            orderId: order.id,
            attemptNo,
            status: payload.success ? 'paid' : 'failed',
            method: 'paymob',
            externalRef: payload.transactionId,
            paymobOrderId: payload.paymobOrderId,
          }),
        );
      };

      if (payload.success) {
        order.status = 'paid';
        order.paymentStatus = 'paid';
        order.paidAt = new Date();
        await orderRepo.save(order);

        if (pendingAttempt) {
          pendingAttempt.status = 'paid';
          pendingAttempt.externalRef = payload.transactionId;
          await paymentRepo.save(pendingAttempt);
        } else {
          await persistAttempt();
        }

        await this.ensureEnrollment(
          manager,
          order.studentId,
          items[0].courseId,
        );
        return;
      }

      order.paymentStatus = 'failed';
      await orderRepo.save(order);

      if (pendingAttempt) {
        pendingAttempt.status = 'failed';
        pendingAttempt.externalRef = payload.transactionId;
        await paymentRepo.save(pendingAttempt);
      } else {
        await persistAttempt();
      }
    });
  }

  async getOrder(studentId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    if (order.studentId !== studentId) {
      throw new ForbiddenException('This is not your order.');
    }
    return this.toResponse(order, await this.loadItems(order.id));
  }

  private async loadItems(orderId: string): Promise<OrderItemEntity[]> {
    return this.orderItemsRepository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  private async hasActiveEnrollment(
    studentId: string,
    courseId: string,
  ): Promise<boolean> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { studentId, courseId, status: 'active', deletedAt: IsNull() },
    });
    return enrollment !== null;
  }

  private async ensureEnrollment(
    manager: EntityManager,
    studentId: string,
    courseId: string,
  ): Promise<void> {
    const repository = manager.getRepository(EnrollmentEntity);
    const existing = await repository.findOne({
      where: { studentId, courseId, status: 'active', deletedAt: IsNull() },
    });
    if (existing) {
      return;
    }
    await repository.save(
      repository.create({ studentId, courseId, status: 'active' }),
    );
  }

  private toResponse(
    order: OrderEntity,
    items: OrderItemEntity[],
  ): OrderResponse {
    return {
      orderReference: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      amountMinor: order.totalMinor,
      timezone: DISPLAY_TIMEZONE,
      items: items.map((item) => ({
        courseId: item.courseId,
        title: item.titleSnapshot,
        priceMinor: item.priceMinor,
      })),
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
    };
  }
}
