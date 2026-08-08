import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  InterventionEntity,
  InterventionStatus,
} from '../../interventions/entities/intervention.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ListInterventionsQueryDto } from '../dto/list-interventions-query.dto';

export interface AdminInterventionListItem {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  courseId: string;
  ruleKey: string;
  weakConcept: string;
  status: InterventionStatus;
  createdAt: string;
  resolvedAt: string | null;
}

const MAX_RESULTS = 200;

// No detail page on the frontend — this is a simple audit/moderation
// list (status toggle + delete), not a resource with its own rich
// content to view. A hard DELETE is safe here: every FK referencing
// interventions(id) is ON DELETE SET NULL or CASCADE (verified against
// 1785000062000-CreateInterventions.ts / ...MiniQuizzes.ts), unlike the
// RESTRICT-heavy FKs on users/courses/orders.
@Injectable()
export class AdminInterventionsService {
  constructor(
    @InjectRepository(InterventionEntity)
    private readonly interventionsRepository: Repository<InterventionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async listInterventions(
    query: ListInterventionsQueryDto,
  ): Promise<AdminInterventionListItem[]> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.studentId) where.studentId = query.studentId;
    if (query.teacherId) where.teacherId = query.teacherId;

    const interventions = await this.interventionsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: MAX_RESULTS,
    });

    const userNames = await this.loadUserNames(
      interventions.flatMap((item) => [item.studentId, item.teacherId]),
    );

    return interventions.map((item) => ({
      id: item.id,
      studentId: item.studentId,
      studentName: userNames.get(item.studentId) ?? '—',
      teacherId: item.teacherId,
      teacherName: userNames.get(item.teacherId) ?? '—',
      courseId: item.courseId,
      ruleKey: item.ruleKey,
      weakConcept: item.weakConcept,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
    }));
  }

  async updateStatus(
    interventionId: string,
    status: InterventionStatus,
  ): Promise<void> {
    const intervention = await this.interventionsRepository.findOne({
      where: { id: interventionId },
    });
    if (!intervention) {
      throw new NotFoundException('Intervention not found.');
    }
    intervention.status = status;
    intervention.resolvedAt = status === 'resolved' ? new Date() : null;
    await this.interventionsRepository.save(intervention);
  }

  async deleteIntervention(interventionId: string): Promise<void> {
    const result = await this.interventionsRepository.delete(interventionId);
    if (result.affected === 0) {
      throw new NotFoundException('Intervention not found.');
    }
  }

  private async loadUserNames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const users = await this.usersRepository.find({
      where: { id: In(uniqueIds) },
    });
    return new Map(users.map((user) => [user.id, user.fullName]));
  }
}
