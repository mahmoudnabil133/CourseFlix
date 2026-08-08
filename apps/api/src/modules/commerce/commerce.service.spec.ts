import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { CoursesService } from '../courses/courses.service';
import { EnrollmentEntity } from '../enrollments/entities/enrollment.entity';
import { CommerceService } from './commerce.service';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity } from './entities/order.entity';
import { PaymentEntity } from './entities/payment.entity';
import {
  PAYMENT_ADAPTER,
  PaymentAdapter,
} from './payments/payment-adapter.interface';
import { TestPaymentAdapter } from './payments/test-payment-adapter';

describe('CommerceService', () => {
  let commerceService: CommerceService;
  let ordersRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let orderItemsRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let paymentsRepository: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let enrollmentsRepository: { findOne: jest.Mock };
  let coursesService: {
    findCourseById: jest.Mock;
    findOwnedCourses: jest.Mock;
  };

  const studentId = 'student-1';
  const courseId = 'course-1';
  const orderId = 'order-1';
  const publishedCourse = {
    id: courseId,
    title: 'الميكانيكا الكلاسيكية',
    status: 'published',
  };

  function mockManager() {
    const orderRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const paymentRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((input: Partial<PaymentEntity>) => input),
      save: jest.fn(),
    };
    const enrollmentRepo = {
      findOne: jest.fn(),
      create: jest.fn((input: Partial<EnrollmentEntity>) => input),
      save: jest.fn(),
    };
    return {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === OrderEntity) return orderRepo;
        if (entity === PaymentEntity) return paymentRepo;
        return enrollmentRepo;
      }),
      orderRepo,
      paymentRepo,
      enrollmentRepo,
    };
  }

  beforeEach(async () => {
    ordersRepository = {
      findOne: jest.fn(),
      create: jest.fn((input: Partial<OrderEntity>) => input),
      save: jest.fn((input: Partial<OrderEntity>) => ({
        id: orderId,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        ...input,
      })),
    };
    orderItemsRepository = {
      find: jest.fn(),
      create: jest.fn((input: Partial<OrderItemEntity>) => input),
      save: jest.fn((input: Partial<OrderItemEntity>) => ({
        id: 'item-1',
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        ...input,
      })),
    };
    paymentsRepository = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input: Partial<PaymentEntity>) => input),
      save: jest.fn(),
    };
    enrollmentsRepository = { findOne: jest.fn() };
    coursesService = {
      findCourseById: jest.fn(),
      findOwnedCourses: jest.fn(),
    };

    const paymentAdapter: PaymentAdapter = new TestPaymentAdapter();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommerceService,
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
        {
          provide: getRepositoryToken(EnrollmentEntity),
          useValue: enrollmentsRepository,
        },
        { provide: CoursesService, useValue: coursesService },
        { provide: PAYMENT_ADAPTER, useValue: paymentAdapter },
        // Each confirm test overrides the service's dataSource directly
        // with a manager-backed transaction mock.
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    commerceService = moduleRef.get(CommerceService);
  });

  describe('createDraftOrder', () => {
    it('creates a pending order with server-set price and currency', async () => {
      coursesService.findCourseById.mockResolvedValue(publishedCourse);
      enrollmentsRepository.findOne.mockResolvedValue(null);

      const result = await commerceService.createDraftOrder(studentId, {
        courseId,
      });

      expect(result.status).toBe('pending');
      expect(result.paymentStatus).toBe('pending');
      expect(result.currency).toBe('EGP');
      expect(result.amountMinor).toBeGreaterThan(0);
      expect(result.orderReference).toBe(orderId);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ courseId, title: publishedCourse.title }),
      );
    });

    it('rejects a course the student already owns', async () => {
      coursesService.findCourseById.mockResolvedValue(publishedCourse);
      enrollmentsRepository.findOne.mockResolvedValue({ id: 'enrollment-1' });

      await expect(
        commerceService.createDraftOrder(studentId, { courseId }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a non-published course', async () => {
      coursesService.findCourseById.mockResolvedValue({
        ...publishedCourse,
        status: 'draft',
      });

      await expect(
        commerceService.createDraftOrder(studentId, { courseId }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns the existing order for a repeated idempotency key', async () => {
      coursesService.findCourseById.mockResolvedValue(publishedCourse);
      enrollmentsRepository.findOne.mockResolvedValue(null);
      ordersRepository.findOne.mockResolvedValue({
        id: 'existing-order',
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        idempotencyKey: 'key-1',
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      orderItemsRepository.find.mockResolvedValue([]);

      const result = await commerceService.createDraftOrder(studentId, {
        courseId,
        idempotencyKey: 'key-1',
      });

      expect(result.orderReference).toBe('existing-order');
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('confirmOrder', () => {
    it('marks the order paid and ensures a single enrollment on success', async () => {
      const manager = mockManager();
      const transaction = jest.fn(
        async <T>(
          fn: (manager: ReturnType<typeof mockManager>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      const dataSource = { transaction };
      (commerceService as unknown as { dataSource: unknown }).dataSource =
        dataSource;

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      orderItemsRepository.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: publishedCourse.title,
          priceMinor: 50000,
        },
      ]);
      manager.enrollmentRepo.findOne.mockResolvedValue(null);

      const result = await commerceService.confirmOrder(studentId, orderId, {
        simulate: 'success',
      });

      expect(result.status).toBe('paid');
      expect(result.paymentStatus).toBe('paid');
      expect(result.paidAt).not.toBeNull();
      expect(manager.paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paid',
          externalRef: 'test-ok',
          attemptNo: 1,
        }),
      );
      expect(manager.enrollmentRepo.save).toHaveBeenCalled();
    });

    it('does not create a second enrollment when one already exists', async () => {
      const manager = mockManager();
      const transaction = jest.fn(
        async <T>(
          fn: (manager: ReturnType<typeof mockManager>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      const dataSource = { transaction };
      (commerceService as unknown as { dataSource: unknown }).dataSource =
        dataSource;

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      orderItemsRepository.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: publishedCourse.title,
          priceMinor: 50000,
        },
      ]);
      manager.enrollmentRepo.findOne.mockResolvedValue({ id: 'existing' });

      await commerceService.confirmOrder(studentId, orderId, {
        simulate: 'success',
      });

      expect(manager.enrollmentRepo.save).not.toHaveBeenCalled();
    });

    it('records a failed payment attempt and stays retryable on decline', async () => {
      const manager = mockManager();
      const transaction = jest.fn(
        async <T>(
          fn: (manager: ReturnType<typeof mockManager>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      const dataSource = { transaction };
      (commerceService as unknown as { dataSource: unknown }).dataSource =
        dataSource;

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      orderItemsRepository.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);

      const result = await commerceService.confirmOrder(studentId, orderId, {
        simulate: 'decline',
      });

      expect(result.status).toBe('pending');
      expect(result.paymentStatus).toBe('failed');
      expect(manager.paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          externalRef: 'test-declined',
        }),
      );
      expect(manager.enrollmentRepo.save).not.toHaveBeenCalled();
    });

    it('returns the authoritative paid order on a duplicate confirm', async () => {
      const manager = mockManager();
      const transaction = jest.fn(
        async <T>(
          fn: (manager: ReturnType<typeof mockManager>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      const dataSource = { transaction };
      (commerceService as unknown as { dataSource: unknown }).dataSource =
        dataSource;

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'paid',
        paymentStatus: 'paid',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: new Date('2026-08-04T10:05:00.000Z'),
      });
      orderItemsRepository.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);

      const result = await commerceService.confirmOrder(studentId, orderId, {});

      expect(result.status).toBe('paid');
      expect(manager.paymentRepo.save).not.toHaveBeenCalled();
      expect(manager.orderRepo.save).not.toHaveBeenCalled();
      expect(manager.enrollmentRepo.save).not.toHaveBeenCalled();
    });

    it('rejects confirmation of another student order with 404 (not found)', async () => {
      const manager = mockManager();
      const transaction = jest.fn(
        async <T>(
          fn: (manager: ReturnType<typeof mockManager>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      const dataSource = { transaction };
      (commerceService as unknown as { dataSource: unknown }).dataSource =
        dataSource;

      manager.orderRepo.findOne.mockResolvedValue(null);

      await expect(
        commerceService.confirmOrder('other-student', orderId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrder', () => {
    it('rejects reading another student receipt', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: orderId,
        studentId: 'someone-else',
        status: 'paid',
      });

      await expect(
        commerceService.getOrder(studentId, orderId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPendingPayableOrder', () => {
    it('returns a pending order owned by the student', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
      });

      const order = await commerceService.getPendingPayableOrder(
        studentId,
        orderId,
      );
      expect(order.id).toBe(orderId);
    });

    it('hides another student order as not found', async () => {
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(
        commerceService.getPendingPayableOrder(studentId, orderId),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a paid order so the student can never pay twice', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'paid',
        paymentStatus: 'paid',
      });

      await expect(
        commerceService.getPendingPayableOrder(studentId, orderId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('recordPaymobPaymentAttempt', () => {
    it('appends a pending paymob attempt with the paymob order id', async () => {
      paymentsRepository.count.mockResolvedValue(1);

      await commerceService.recordPaymobPaymentAttempt(orderId, '9001');

      expect(paymentsRepository.count).toHaveBeenCalledWith({
        where: { orderId },
      });
      expect(ordersRepository.save).not.toHaveBeenCalled();
      expect(orderItemsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findCourseIdByPaymobOrderId', () => {
    it('maps a paymob order id to the purchased course', async () => {
      paymentsRepository.findOne = jest.fn().mockResolvedValue({
        id: 'payment-1',
        orderId,
        paymobOrderId: '9001',
      });
      orderItemsRepository.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);

      const course = await commerceService.findCourseIdByPaymobOrderId('9001');
      expect(course).toBe(courseId);
    });

    it('returns null when no paymob attempt matches', async () => {
      paymentsRepository.findOne = jest.fn().mockResolvedValue(null);

      const course = await commerceService.findCourseIdByPaymobOrderId('9999');
      expect(course).toBeNull();
    });
  });

  describe('fulfillPaymobWebhook', () => {
    function managerWithRepo() {
      const orderRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
      };
      const paymentRepo = {
        findOne: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((input: Partial<PaymentEntity>) => input),
        save: jest.fn(),
      };
      const itemRepo = { find: jest.fn() };
      const enrollmentRepo = {
        findOne: jest.fn(),
        create: jest.fn((input: Partial<EnrollmentEntity>) => input),
        save: jest.fn(),
      };
      return {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === OrderEntity) return orderRepo;
          if (entity === PaymentEntity) return paymentRepo;
          if (entity === OrderItemEntity) return itemRepo;
          return enrollmentRepo;
        }),
        orderRepo,
        paymentRepo,
        itemRepo,
        enrollmentRepo,
      };
    }

    function runTransaction(manager: ReturnType<typeof managerWithRepo>) {
      const transaction = jest.fn(
        async <T>(
          fn: (m: ReturnType<typeof managerWithRepo>) => Promise<T>,
        ): Promise<T> => fn(manager),
      );
      (commerceService as unknown as { dataSource: unknown }).dataSource = {
        transaction,
      };
    }

    it('marks the order paid and enrolls on a successful webhook', async () => {
      const manager = managerWithRepo();
      runTransaction(manager);

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      manager.itemRepo.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);
      manager.paymentRepo.findOne.mockResolvedValue(null);
      manager.enrollmentRepo.findOne.mockResolvedValue(null);

      await commerceService.fulfillPaymobWebhook({
        merchantOrderId: orderId,
        paymobOrderId: '9001',
        transactionId: '777001',
        success: true,
      });

      expect(manager.orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid', paymentStatus: 'paid' }),
      );
      expect(manager.paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptNo: 1,
          status: 'paid',
          method: 'paymob',
          externalRef: '777001',
          paymobOrderId: '9001',
        }),
      );
      expect(manager.enrollmentRepo.save).toHaveBeenCalled();
    });

    it('resolves the existing pending attempt instead of creating a second row', async () => {
      const manager = managerWithRepo();
      runTransaction(manager);

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      manager.itemRepo.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);
      manager.paymentRepo.findOne.mockResolvedValue({
        id: 'payment-1',
        orderId,
        attemptNo: 1,
        status: 'pending',
        method: 'paymob',
        paymobOrderId: '9001',
      });
      manager.paymentRepo.save.mockImplementation(
        (payment: Partial<PaymentEntity>) => payment,
      );
      manager.enrollmentRepo.findOne.mockResolvedValue(null);

      await commerceService.fulfillPaymobWebhook({
        merchantOrderId: orderId,
        paymobOrderId: '9001',
        transactionId: '777001',
        success: true,
      });

      expect(manager.paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'payment-1', status: 'paid' }),
      );
      expect(manager.paymentRepo.create).not.toHaveBeenCalled();
      expect(manager.enrollmentRepo.save).toHaveBeenCalled();
    });

    it('keeps the order retryable and records a failed attempt on decline', async () => {
      const manager = managerWithRepo();
      runTransaction(manager);

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'pending',
        paymentStatus: 'pending',
        currency: 'EGP',
        totalMinor: 50000,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        paidAt: null,
      });
      manager.orderRepo.save.mockImplementation(
        (order: Partial<OrderEntity>) => order,
      );
      manager.itemRepo.find.mockResolvedValue([
        {
          id: 'item-1',
          orderId,
          courseId,
          titleSnapshot: 'c',
          priceMinor: 50000,
        },
      ]);
      manager.paymentRepo.findOne.mockResolvedValue(null);
      manager.enrollmentRepo.findOne.mockResolvedValue(null);

      await commerceService.fulfillPaymobWebhook({
        merchantOrderId: orderId,
        paymobOrderId: '9001',
        transactionId: '777002',
        success: false,
      });

      expect(manager.orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', paymentStatus: 'failed' }),
      );
      expect(manager.paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          method: 'paymob',
          paymobOrderId: '9001',
        }),
      );
      expect(manager.enrollmentRepo.save).not.toHaveBeenCalled();
    });

    it('is a no-op on an already paid order (duplicate webhook)', async () => {
      const manager = managerWithRepo();
      runTransaction(manager);

      manager.orderRepo.findOne.mockResolvedValue({
        id: orderId,
        studentId,
        status: 'paid',
        paymentStatus: 'paid',
        paidAt: new Date(),
      });

      await commerceService.fulfillPaymobWebhook({
        merchantOrderId: orderId,
        paymobOrderId: '9001',
        transactionId: '777003',
        success: true,
      });

      expect(manager.orderRepo.save).not.toHaveBeenCalled();
      expect(manager.paymentRepo.save).not.toHaveBeenCalled();
      expect(manager.enrollmentRepo.save).not.toHaveBeenCalled();
    });
  });
});
