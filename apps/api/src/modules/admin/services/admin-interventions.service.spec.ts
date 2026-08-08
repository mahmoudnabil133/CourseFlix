/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InterventionEntity } from '../../interventions/entities/intervention.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AdminInterventionsService } from './admin-interventions.service';

describe('AdminInterventionsService', () => {
  let service: AdminInterventionsService;
  let interventionsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let usersRepository: { find: jest.Mock };

  beforeEach(async () => {
    interventionsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      delete: jest.fn(),
    };
    usersRepository = { find: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminInterventionsService,
        {
          provide: getRepositoryToken(InterventionEntity),
          useValue: interventionsRepository,
        },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
      ],
    }).compile();

    service = moduleRef.get(AdminInterventionsService);
  });

  it('sets resolvedAt when marking an intervention resolved', async () => {
    interventionsRepository.findOne.mockResolvedValue({
      id: 'iv-1',
      status: 'active',
      resolvedAt: null,
    });

    await service.updateStatus('iv-1', 'resolved');

    expect(interventionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        resolvedAt: expect.any(Date),
      }),
    );
  });

  it('clears resolvedAt when reopening', async () => {
    interventionsRepository.findOne.mockResolvedValue({
      id: 'iv-1',
      status: 'resolved',
      resolvedAt: new Date(),
    });

    await service.updateStatus('iv-1', 'active');

    expect(interventionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', resolvedAt: null }),
    );
  });

  it('throws NotFoundException deleting a missing intervention', async () => {
    interventionsRepository.delete.mockResolvedValue({ affected: 0 });
    await expect(service.deleteIntervention('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
