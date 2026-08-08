import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AnswerPolicyService {
  constructor(private readonly configService: ConfigService) {}

  // Generic over any chunk with a `score` field so it applies equally to
  // course-document chunks (Tutor) and video-transcript chunks (Video Q&A).
  getRelevantChunks<T extends { score: number }>(chunks: T[]): T[] {
    const maxDistance = Number(
      this.configService.get<string>('TUTOR_MAX_DISTANCE') ?? 1.35,
    );

    return chunks.filter((chunk) => Number(chunk.score) <= maxDistance);
  }
}
