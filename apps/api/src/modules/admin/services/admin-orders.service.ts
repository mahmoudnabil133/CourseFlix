import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderEntity, OrderStatus } from '../../commerce/entities/order.entity';
import { OrderItemEntity } from '../../commerce/entities/order-item.entity';
import { PaymentEntity } from '../../commerce/entities/payment.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';

export interface AdminOrderListItem {
  id: string;
  studentId: string;
  studentName: string;
  status: OrderStatus;
  paymentStatus: OrderEntity['paymentStatus'];
  currency: string;
  totalMinor: number;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  items: Array<{ courseId: string; title: string; priceMinor: number }>;
  payments: Array<{
    id: string;
    attemptNo: number;
    status: OrderEntity['paymentStatus'];
    method: string;
    externalRef: string | null;
    createdAt: string;
  }>;
}

const MAX_RESULTS = 200;

// Read-only by design: orders/payments are financial/audit records.
// There is no cancel/refund concept in this schema (OrderStatus is only
// pending/paid/failed, driven entirely by CommerceService's checkout
// flow) — inventing one here would fabricate money-handling semantics
// this sprint's commerce domain never actually implements. An admin can
// see everything; only the checkout flow itself changes an order's state.
@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly orderItemsRepository: Repository<OrderItemEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepository: Repository<PaymentEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async listOrders(query: ListOrdersQueryDto): Promise<AdminOrderListItem[]> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.studentId) where.studentId = query.studentId;

    const orders = await this.ordersRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: MAX_RESULTS,
    });

    const studentNames = await this.loadStudentNames(
      orders.map((order) => order.studentId),
    );

    return orders.map((order) => this.toListItem(order, studentNames));
  }

  async getOrderDetail(orderId: string): Promise<AdminOrderDetail> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const [items, payments, studentNames] = await Promise.all([
      this.orderItemsRepository.find({ where: { orderId } }),
      this.paymentsRepository.find({
        where: { orderId },
        order: { attemptNo: 'ASC' },
      }),
      this.loadStudentNames([order.studentId]),
    ]);

    return {
      ...this.toListItem(order, studentNames),
      items: items.map((item) => ({
        courseId: item.courseId,
        title: item.titleSnapshot,
        priceMinor: item.priceMinor,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        attemptNo: payment.attemptNo,
        status: payment.status,
        method: payment.method,
        externalRef: payment.externalRef,
        createdAt: payment.createdAt.toISOString(),
      })),
    };
  }

  private async loadStudentNames(
    studentIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(studentIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const users = await this.usersRepository.find({
      where: { id: In(uniqueIds) },
    });
    return new Map(users.map((user) => [user.id, user.fullName]));
  }

  private toListItem(
    order: OrderEntity,
    studentNames: Map<string, string>,
  ): AdminOrderListItem {
    return {
      id: order.id,
      studentId: order.studentId,
      studentName: studentNames.get(order.studentId) ?? '—',
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      totalMinor: order.totalMinor,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    };
  }
}
