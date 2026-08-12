import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RETRIEVAL_PORT,
  RetrievalPort,
  RetrievedVideoChunk,
} from '../../common/ports/retrieval.port';
import {
  LLM_PROVIDER,
  LlmGenerateResult,
  LlmProvider,
} from '../tutor/adapters/llm.adapter';
import { AnswerPolicyService } from '../tutor/prompt/answer-policy.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { VideoEntity } from '../lessons/entities/video.entity';
import {
  VideoTranscriptEntity,
  VideoTranscriptStatus,
} from '../video-ingestion/entities/video-transcript.entity';
import {
  buildGroundedVideoPrompt,
  GROUNDED_VIDEO_QA_PROMPT_VERSION,
} from './prompt/grounded-video-prompt.template';

export interface VideoQaCitation {
  chunkId: string;
  startSeconds: number | null;
  endSeconds: number | null;
  excerpt: string;
}

export interface VideoQaResponse {
  status: 'answered' | 'no_answer' | 'not_ready';
  answer: string;
  citations: VideoQaCitation[];
}

export interface VideoQaStatusResponse {
  status: VideoTranscriptStatus | 'not_available';
}

const NOT_READY_MESSAGE = 'نص هذا الفيديو لسه بيتجهز، جرب تسأل تاني بعد شوية.';
const NO_ANSWER_MESSAGE = 'محتوى هذا الفيديو لا يغطي هذا السؤال.';

@Injectable()
export class VideoQaService {
  private readonly logger = new Logger(VideoQaService.name);

  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly answerPolicyService: AnswerPolicyService,
    @Inject(RETRIEVAL_PORT)
    private readonly retrievalPort: RetrievalPort,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>,
    @InjectRepository(VideoTranscriptEntity)
    private readonly transcriptsRepository: Repository<VideoTranscriptEntity>,
  ) {}

  async getStatus(input: {
    videoId: string;
    studentId: string;
  }): Promise<VideoQaStatusResponse> {
    const video = await this.loadVideo(input.videoId);
    await this.enrollmentsService.assertStudentEnrolled(
      input.studentId,
      video.courseId,
    );

    const transcript = await this.transcriptsRepository.findOne({
      where: { videoId: input.videoId },
    });

    return { status: transcript?.processingStatus ?? 'not_available' };
  }

  async ask(input: {
    videoId: string;
    studentId: string;
    question: string;
  }): Promise<VideoQaResponse> {
    const question = input.question.trim();
    if (!question) {
      throw new BadRequestException('Question cannot be empty.');
    }

    const video = await this.loadVideo(input.videoId);
    await this.enrollmentsService.assertStudentEnrolled(
      input.studentId,
      video.courseId,
    );

    const transcript = await this.transcriptsRepository.findOne({
      where: { videoId: input.videoId },
    });

    if (!transcript || transcript.processingStatus !== 'completed') {
      this.logger.log(
        `Video Q&A not_ready trace: videoId=${input.videoId} status=${transcript?.processingStatus ?? 'not_available'}`,
      );
      return { status: 'not_ready', answer: NOT_READY_MESSAGE, citations: [] };
    }

    const retrievedChunks = await this.retrievalPort.searchVideo({
      videoTranscriptId: transcript.id,
      query: question,
      topK: 5,
    });
    const relevantChunks = this.answerPolicyService.getRelevantChunks(
      retrievedChunks,
      'VIDEO_QA_MAX_DISTANCE',
      1.8,
    );

    if (relevantChunks.length === 0) {
      this.logger.log(
        `Video Q&A no_answer trace: videoId=${input.videoId} chunks=${retrievedChunks.length}`,
      );
      return { status: 'no_answer', answer: NO_ANSWER_MESSAGE, citations: [] };
    }

    const prompt = buildGroundedVideoPrompt({
      question,
      chunks: relevantChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        startSeconds: chunk.startSeconds,
        excerpt: chunk.excerpt,
      })),
    });

    let llmResult: LlmGenerateResult;
    try {
      llmResult = await this.llmProvider.generateAnswer({
        prompt,
        question,
        chunks: relevantChunks,
      });
    } catch (error) {
      this.logger.warn(
        `Video Q&A provider failure videoId=${input.videoId} provider=${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new ServiceUnavailableException(
        'Video assistant is temporarily unavailable. Please try again.',
      );
    }

    const chunksById = new Map(
      relevantChunks.map((chunk) => [chunk.chunkId, chunk]),
    );
    const citations = Array.from(new Set(llmResult.citedChunkIds))
      .map((chunkId) => chunksById.get(chunkId))
      .filter((chunk): chunk is RetrievedVideoChunk => Boolean(chunk))
      .map((chunk) => ({
        chunkId: chunk.chunkId,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        excerpt: chunk.excerpt,
      }));

    if (citations.length === 0) {
      this.logger.log(
        `Video Q&A downgraded to no_answer trace: videoId=${input.videoId}`,
      );
      return { status: 'no_answer', answer: NO_ANSWER_MESSAGE, citations: [] };
    }

    this.logger.log(
      `Video Q&A answered trace: videoId=${input.videoId} citations=${citations.length} model=${llmResult.modelName} promptVersion=${GROUNDED_VIDEO_QA_PROMPT_VERSION}`,
    );

    return { status: 'answered', answer: llmResult.answer, citations };
  }

  private async loadVideo(videoId: string): Promise<VideoEntity> {
    const video = await this.videosRepository.findOne({
      where: { id: videoId },
    });
    if (!video) {
      throw new NotFoundException('Video not found.');
    }
    return video;
  }
}
