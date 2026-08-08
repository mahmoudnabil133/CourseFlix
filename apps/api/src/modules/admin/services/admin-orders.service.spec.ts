import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../commerce/entities/order.entity';
import { OrderItemEntity } from '../../commerce/entities/order-item.entity';
import { PaymentEntity } from '../../commerce/entities/payment.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AdminOrdersService } from './admin-orders.service';

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;
  let ordersRepository: { find: jest.Mock; findOne: jest.Mock };
  let orderItemsRepository: { find: jest.Mock };
  let paymentsRepository: { find: jest.Mock };
  let usersRepository: { find: jest.Mock };

  const orderId = 'order-1';
  const studentId = 'student-1';

  beforeEach(async () => {
    ordersRepository = { find: jest.fn(), findOne: jest.fn() };
    orderItemsRepository = { find: jest.fn().mockResolvedValue([]) };
    paymentsRepository = { find: jest.fn().mockResolvedValue([]) };
    usersRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: studentId, fullName: 'طالب تجريبي' }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: ordersRepository,
        },
        {
          provide: getRepositoryToken(OrderItemEntity),
          useValue: orderItemsRepository,
        },
        {
          provide: getRepositoryToken(PaymentEntity),
          useValue: paymentsRepository,
        },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
      ],
    }).compile();

    service = moduleRef.get(AdminOrdersService);
  });

  it('lists orders with the student name resolved', async () => {
    ordersRepository.find.mockResolvedValue([
      {
        id: orderId,
        studentId,
        status: 'paid',
        paymentStatus: 'paid',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        paidAt: new Date('2026-01-01T00:05:00Z'),
      },
    ]);

    const result = await service.listOrders({});

    expect(result[0].studentName).toBe('طالب تجريبي');
  });

  it('throws NotFoundException for a missing order', async () => {
    ordersRepository.findOne.mockResolvedValue(null);
    await expect(service.getOrderDetail('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('includes items and payments in the detail response', async () => {
    ordersRepository.findOne.mockResolvedValue({
      id: orderId,
      studentId,
      status: 'paid',
      paymentStatus: 'paid',
      currency: 'EGP',
      totalMinor: 50000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      paidAt: new Date('2026-01-01T00:05:00Z'),
    });
    orderItemsRepository.find.mockResolvedValue([
      { courseId: 'course-1', titleSnapshot: 'الفيزياء', priceMinor: 50000 },
    ]);
    paymentsRepository.find.mockResolvedValue([
      {
        id: 'payment-1',
        attemptNo: 1,
        status: 'paid',
        method: 'test_adapter',
        externalRef: 'test-ok',
        createdAt: new Date('2026-01-01T00:05:00Z'),
      },
    ]);

    const result = await service.getOrderDetail(orderId);

    expect(result.items).toHaveLength(1);
    expect(result.payments).toHaveLength(1);
  });
});
