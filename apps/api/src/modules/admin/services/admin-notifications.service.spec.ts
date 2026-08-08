import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NOTIFICATION_PRODUCER_PORT } from '../../../common/ports/notification-producer.port';
import { NotificationEntity } from '../../notifications/entities/notification.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AdminNotificationsService } from './admin-notifications.service';

describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let notificationsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    softRemove: jest.Mock;
  };
  let usersRepository: { find: jest.Mock; findOne: jest.Mock };
  let notificationProducer: { notify: jest.Mock };

  beforeEach(async () => {
    notificationsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
    };
    usersRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    notificationProducer = { notify: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        {
          provide: getRepositoryToken(NotificationEntity),
          useValue: notificationsRepository,
        },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: NOTIFICATION_PRODUCER_PORT, useValue: notificationProducer },
      ],
    }).compile();

    service = moduleRef.get(AdminNotificationsService);
  });

  it('soft-removes an existing notification', async () => {
    const notification = { id: 'n-1', deletedAt: null };
    notificationsRepository.findOne.mockResolvedValue(notification);

    await service.deleteNotification('n-1');

    expect(notificationsRepository.softRemove).toHaveBeenCalledWith(
      notification,
    );
  });

  it('throws NotFoundException for a missing notification', async () => {
    notificationsRepository.findOne.mockResolvedValue(null);
    await expect(service.deleteNotification('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('sendNotification', () => {
    it('routes the message through the notification producer as an announcement', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 'user-1' });

      await service.sendNotification({
        userId: 'user-1',
        title: 'مراجعة الدورة',
        message: 'في مشكلة في الدرس التالت',
      });

      expect(notificationProducer.notify).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'announcement',
        title: 'مراجعة الدورة',
        message: 'في مشكلة في الدرس التالت',
        relatedEntityType: undefined,
        relatedEntityId: undefined,
      });
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.sendNotification({
          userId: 'missing',
          title: 'x',
          message: 'y',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(notificationProducer.notify).not.toHaveBeenCalled();
    });
  });
});
