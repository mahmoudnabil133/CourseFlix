import { Repository } from 'typeorm';
import { JobsService } from '../jobs/jobs.service';
import { VideoEntity } from '../lessons/entities/video.entity';
import { VideoTranscriptEntity } from './entities/video-transcript.entity';
import { VideoIngestionService } from './video-ingestion.service';

describe('VideoIngestionService', () => {
  let service: VideoIngestionService;
  let transcriptsRepository: jest.Mocked<
    Pick<Repository<VideoTranscriptEntity>, 'findOne' | 'save' | 'create'>
  >;
  let jobsService: jest.Mocked<Pick<JobsService, 'enqueueVideoIngestion'>>;

  const video = {
    id: 'video-1',
    courseId: 'course-1',
    sectionId: 'section-1',
    lessonId: 'lesson-1',
  } as VideoEntity;

  beforeEach(() => {
    transcriptsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity as VideoTranscriptEntity),
      save: jest
        .fn()
        .mockImplementation((entity) =>
          Promise.resolve({ id: 'transcript-1', version: 1, ...entity }),
        ),
    };
    jobsService = {
      enqueueVideoIngestion: jest
        .fn()
        .mockResolvedValue('video-ingest:transcript-1:v1'),
    };

    service = new VideoIngestionService(
      transcriptsRepository as unknown as Repository<VideoTranscriptEntity>,
      jobsService as unknown as JobsService,
    );
  });

  it('queues a youtube video with the youtube provider', async () => {
    await service.enqueueForVideo({
      ...video,
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
    });

    expect(transcriptsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'youtube' }),
    );
    expect(jobsService.enqueueVideoIngestion).toHaveBeenCalledWith(
      'transcript-1',
      1,
    );
  });

  it('queues a Bunny Stream embed with the bunny provider', async () => {
    await service.enqueueForVideo({
      ...video,
      videoUrl: 'https://iframe.mediadelivery.net/embed/123/guid',
    });

    expect(transcriptsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'bunny' }),
    );
  });

  it('queues a self-hosted/direct video URL with the local provider instead of skipping it', async () => {
    await service.enqueueForVideo({
      ...video,
      videoUrl: 'https://cdn.example.com/lectures/lesson-1.mp4',
    });

    expect(transcriptsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'local' }),
    );
    expect(jobsService.enqueueVideoIngestion).toHaveBeenCalledWith(
      'transcript-1',
      1,
    );
  });

  it('skips ingestion entirely when the video URL cannot be parsed', async () => {
    await service.enqueueForVideo({
      ...video,
      videoUrl: 'not-a-url',
    });

    expect(transcriptsRepository.save).not.toHaveBeenCalled();
    expect(jobsService.enqueueVideoIngestion).not.toHaveBeenCalled();
  });
});
