import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { CourseEntity } from '../../courses/entities/course.entity';
import { OrderEntity } from '../../commerce/entities/order.entity';
import { InterventionEntity } from '../../interventions/entities/intervention.entity';
import { AdminAnalyticsService } from './admin-analytics.service';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let usersRepository: { count: jest.Mock };
  let coursesRepository: { count: jest.Mock };
  let ordersRepository: {
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let interventionsRepository: { count: jest.Mock };
  let getRawOne: jest.Mock;

  beforeEach(async () => {
    usersRepository = { count: jest.fn().mockResolvedValue(0) };
    coursesRepository = { count: jest.fn().mockResolvedValue(0) };
    getRawOne = jest.fn().mockResolvedValue({ total: '150000' });
    ordersRepository = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne,
      }),
    };
    interventionsRepository = { count: jest.fn().mockResolvedValue(0) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: coursesRepository,
        },
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: ordersRepository,
        },
        {
          provide: getRepositoryToken(InterventionEntity),
          useValue: interventionsRepository,
        },
      ],
    }).compile();

    service = moduleRef.get(AdminAnalyticsService);
  });

  it('sums paid-order revenue in minor units', async () => {
    const result = await service.getOverview();
    expect(result.commerce.revenueMinor).toBe(150000);
    expect(result.commerce.currency).toBe('EGP');
  });

  it('defaults revenue to 0 when there are no paid orders', async () => {
    getRawOne.mockResolvedValue({ total: '0' });
    const result = await service.getOverview();
    expect(result.commerce.revenueMinor).toBe(0);
  });
});
