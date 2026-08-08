import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module';
import { VideoTranscriptEntity } from './entities/video-transcript.entity';
import { VideoChunkEntity } from './entities/video-chunk.entity';
import { VideoIngestionService } from './video-ingestion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoTranscriptEntity, VideoChunkEntity]),
    JobsModule,
  ],
  providers: [VideoIngestionService],
  exports: [VideoIngestionService],
})
export class VideoIngestionModule {}
