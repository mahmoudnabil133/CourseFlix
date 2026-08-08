import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JOB_QUEUE_PORT } from '../../common/ports/job-queue.port';
import { AiJobEntity } from './entities/ai_jobs.entity';
import { DocumentChunkEntity } from './entities/document-chunk.entity';
import { JobsService } from './jobs.service';
import { BullMqJobQueue } from './adapters/bullmq-job-queue.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiJobEntity, DocumentChunkEntity]),
    BullModule.registerQueue(
      { name: 'ingestion' },
      { name: 'video-ingestion' },
      { name: 'exam-generation' },
    ),
  ],
  providers: [
    JobsService,
    { provide: JOB_QUEUE_PORT, useClass: BullMqJobQueue },
  ],
  exports: [JobsService, JOB_QUEUE_PORT],
})
export class JobsModule {}
