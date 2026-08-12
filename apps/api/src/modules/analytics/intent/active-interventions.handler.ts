import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterventionEntity } from '../../interventions/entities/intervention.entity';
import type {
  AnalyticsIntentContext,
  AnalyticsIntentHandler,
  AnalyticsIntentResult,
} from './analytics-intent-handler.interface';

@Injectable()
export class ActiveInterventionsIntentHandler implements AnalyticsIntentHandler {
  readonly name = 'active_interventions';

  constructor(
    @InjectRepository(InterventionEntity)
    private readonly interventionsRepository: Repository<InterventionEntity>,
  ) {}

  async handle(
    context: AnalyticsIntentContext,
  ): Promise<AnalyticsIntentResult> {
    const row = await this.interventionsRepository
      .createQueryBuilder('intervention')
      .select('COUNT(intervention.id)', 'activeInterventionCount')
      .addSelect(
        'COUNT(DISTINCT intervention.student_id)',
        'affectedStudentCount',
      )
      .where('intervention.teacher_id = :teacherId', {
        teacherId: context.teacherId,
      })
      .andWhere('intervention.status = :status', { status: 'active' })
      .getRawOne();

    return {
      intent: this.name,
      activeInterventionCount: Number(row?.activeInterventionCount ?? 0),
      affectedStudentCount: Number(row?.affectedStudentCount ?? 0),
      dateRange: { from: null, to: null },
      rowCount: 1,
    };
  }
}
