import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { CourseEntity } from '../../courses/entities/course.entity';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity';
import { OrderEntity } from '../../commerce/entities/order.entity';
import { UsersService } from '../../users/users.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let usersRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let usersQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
  let coursesRepository: { count: jest.Mock };
  let enrollmentsRepository: { count: jest.Mock };
  let ordersRepository: { count: jest.Mock };
  let usersService: { findByEmail: jest.Mock; createUser: jest.Mock };

  const adminId = 'admin-1';
  const otherAdminId = 'admin-2';
  const studentId = 'student-1';

  function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
      id: studentId,
      fullName: 'Student One',
      email: 's1@courseflix.local',
      passwordHash: 'hash',
      role: 'student',
      avatarUrl: null,
      status: 'active',
      lastLoginAt: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    usersQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    usersRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((user) => Promise.resolve(user)),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(usersQueryBuilder),
    };
    coursesRepository = { count: jest.fn().mockResolvedValue(0) };
    enrollmentsRepository = { count: jest.fn().mockResolvedValue(0) };
    ordersRepository = { count: jest.fn().mockResolvedValue(0) };
    usersService = { findByEmail: jest.fn(), createUser: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        {
          provide: getRepositoryToken(CourseEntity),
          useValue: coursesRepository,
        },
        {
          provide: getRepositoryToken(EnrollmentEntity),
          useValue: enrollmentsRepository,
        },
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: ordersRepository,
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = moduleRef.get(AdminUsersService);
  });

  describe('listUsers', () => {
    it('applies only the deleted_at filter with no role/status/search', async () => {
      await service.listUsers({});

      expect(usersRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(usersQueryBuilder.where).toHaveBeenCalledWith(
        'user.deleted_at IS NULL',
      );
      expect(usersQueryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('matches name/email/watermark-ID/full-UUID together when searching', async () => {
      usersQueryBuilder.getMany.mockResolvedValue([makeUser()]);

      const result = await service.listUsers({ search: '183C1F78A6' });

      expect(usersQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.any(Object),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(studentId);
    });
  });

  describe('getUserDetail', () => {
    it('returns profile plus dependent record counts', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser());
      coursesRepository.count.mockResolvedValue(2);
      enrollmentsRepository.count.mockResolvedValue(5);
      ordersRepository.count.mockResolvedValue(1);

      const result = await service.getUserDetail(studentId);

      expect(result.dependentRecordCounts).toEqual({
        coursesTaught: 2,
        enrollments: 5,
        orders: 1,
      });
    });

    it('throws NotFoundException for a soft-deleted or missing user', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(service.getUserDetail('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('self-protection', () => {
    it('rejects an admin changing their own role', async () => {
      await expect(
        service.updateRole(adminId, adminId, 'teacher'),
      ).rejects.toThrow(BadRequestException);
      expect(usersRepository.findOne).not.toHaveBeenCalled();
    });

    it('rejects an admin suspending their own account', async () => {
      await expect(
        service.updateStatus(adminId, adminId, 'suspended'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an admin soft-deleting their own account', async () => {
      await expect(service.softDelete(adminId, adminId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('last-admin protection', () => {
    it('blocks demoting the only remaining admin', async () => {
      usersRepository.findOne.mockResolvedValue(
        makeUser({ id: otherAdminId, role: 'admin' }),
      );
      usersRepository.count.mockResolvedValue(1);

      await expect(
        service.updateRole(adminId, otherAdminId, 'teacher'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows demoting an admin when another admin still exists', async () => {
      usersRepository.findOne.mockResolvedValue(
        makeUser({ id: otherAdminId, role: 'admin' }),
      );
      usersRepository.count.mockResolvedValue(2);

      await expect(
        service.updateRole(adminId, otherAdminId, 'teacher'),
      ).resolves.toBeDefined();
    });
  });

  describe('hardDelete', () => {
    it('surfaces a clear 409 when the user has dependent rows', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser());
      const fkError = new QueryFailedError('DELETE ...', [], new Error('fk'));
      (fkError as unknown as { code: string }).code = '23503';
      usersRepository.delete.mockRejectedValue(fkError);
      coursesRepository.count.mockResolvedValue(0);
      enrollmentsRepository.count.mockResolvedValue(3);
      ordersRepository.count.mockResolvedValue(0);

      await expect(service.hardDelete(adminId, studentId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes cleanly when the user has no dependent rows', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser());
      usersRepository.delete.mockResolvedValue({ affected: 1 });

      await expect(
        service.hardDelete(adminId, studentId),
      ).resolves.toBeUndefined();
    });
  });

  describe('createAdmin', () => {
    it('rejects a duplicate email', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser());
      await expect(
        service.createAdmin({
          fullName: 'New Admin',
          email: 's1@courseflix.local',
          password: 'Password123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the user with role admin', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(
        makeUser({ id: 'new-admin', role: 'admin' }),
      );
      usersRepository.findOne.mockResolvedValue(
        makeUser({ id: 'new-admin', role: 'admin' }),
      );

      await service.createAdmin({
        fullName: 'New Admin',
        email: 'new-admin@courseflix.local',
        password: 'Password123!',
      });

      expect(usersService.createUser).toHaveBeenCalledWith(
        'New Admin',
        'new-admin@courseflix.local',
        expect.any(String),
        'active',
        'admin',
      );
    });
  });
});
