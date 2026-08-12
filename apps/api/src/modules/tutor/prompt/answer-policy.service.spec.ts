import { ConfigService } from '@nestjs/config';
import type { RetrievedChunk } from '../../../common/ports/retrieval.port';
import { AnswerPolicyService } from './answer-policy.service';

const makeChunk = (score: number): RetrievedChunk => ({
  chunkId: `chunk-${score}`,
  vectorId: `vector-${score}`,
  documentId: 'document-1',
  page: 1,
  excerpt: 'excerpt',
  score,
});

describe('AnswerPolicyService', () => {
  it('uses the Chroma cosine-distance default from local config', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const service = new AnswerPolicyService(configService);

    expect(service.getRelevantChunks([makeChunk(1.2), makeChunk(1.4)])).toEqual(
      [makeChunk(1.2)],
    );
  });

  it('honors TUTOR_MAX_DISTANCE overrides', () => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'TUTOR_MAX_DISTANCE' ? '0.5' : undefined,
      ),
    } as unknown as ConfigService;

    const service = new AnswerPolicyService(configService);

    expect(service.getRelevantChunks([makeChunk(0.4), makeChunk(0.6)])).toEqual(
      [makeChunk(0.4)],
    );
  });
});
