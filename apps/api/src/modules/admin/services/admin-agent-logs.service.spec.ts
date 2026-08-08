import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentLogEntity } from '../../agent-logs/entities/agent-log.entity';
import { AdminAgentLogsService } from './admin-agent-logs.service';

describe('AdminAgentLogsService', () => {
  let service: AdminAgentLogsService;
  let agentLogsRepository: { find: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    agentLogsRepository = {
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAgentLogsService,
        {
          provide: getRepositoryToken(AgentLogEntity),
          useValue: agentLogsRepository,
        },
      ],
    }).compile();

    service = moduleRef.get(AdminAgentLogsService);
  });

  it('lists logs platform-wide with no ownership scoping', async () => {
    await service.listAgentLogs({});
    expect(agentLogsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('throws NotFoundException deleting a missing log', async () => {
    agentLogsRepository.delete.mockResolvedValue({ affected: 0 });
    await expect(service.deleteAgentLog('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
