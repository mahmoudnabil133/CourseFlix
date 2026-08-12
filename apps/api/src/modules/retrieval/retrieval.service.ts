import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChromaClient, Collection } from 'chromadb';
import type { EmbeddingFunction as ChromaEmbeddingFunction } from 'chromadb';
import {
  RetrievalPort,
  SearchQueryInput,
  RetrievedChunk,
  SearchVideoQueryInput,
  RetrievedVideoChunk,
} from '../../common/ports/retrieval.port';
import type { EmbeddingProvider } from './embedding.adapter';
import { EMBEDDING_PROVIDER } from './embedding.adapter';

interface DocumentChunkRow {
  id: string;
  vector_id: string;
  document_id: string;
  page_number: number;
  text_preview: string;
}

interface VideoChunkRow {
  id: string;
  vector_id: string;
  video_transcript_id: string;
  start_seconds: number | null;
  end_seconds: number | null;
  text_preview: string | null;
}

interface ChromaQueryResult {
  ids?: string[][];
  distances?: (number | null)[][];
  documents?: (string | null)[][];
}

const explicitEmbeddingsOnly: ChromaEmbeddingFunction = {
  name: 'courseflix-explicit-embeddings',
  async generate(): Promise<number[][]> {
    throw new Error('CourseFlix passes embeddings explicitly to ChromaDB');
  },
};

function isChromaNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'ChromaNotFoundError' ||
    error.message.toLowerCase().includes('resource could not be found')
  );
}

@Injectable()
export class RetrievalService implements RetrievalPort {
  private readonly logger = new Logger(RetrievalService.name);
  private collection: Collection | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  private async getCollection(): Promise<Collection> {
    if (this.collection) {
      return this.collection;
    }

    const chromaUrl =
      this.configService.get<string>('CHROMA_URL') || 'http://localhost:8000';
    const collectionName =
      this.configService.get<string>('CHROMA_COLLECTION') || 'courseflix-dev';

    const client = new ChromaClient({ path: chromaUrl });
    this.collection = await client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: explicitEmbeddingsOnly,
    });

    return this.collection;
  }

  /**
   * Queries ChromaDB vector store with mandatory course-level isolation filter.
   *
   * Filter rule:
   * `where: { $and: [{ courseId: input.courseId }, { isActive: true }] }`
   *
   * Joins retrieved vector IDs with Postgres `document_chunks` table to populate
   * exact page numbers and document IDs.
   */
  async search(input: SearchQueryInput): Promise<RetrievedChunk[]> {
    const { courseId, query, topK = 5 } = input;

    if (!courseId) {
      throw new Error('Retrieval search failed: courseId is required');
    }

    if (!query || !query.trim()) {
      return [];
    }

    const [queryVector] = await this.embeddingProvider.embed([query]);
    if (!queryVector || queryVector.length === 0) {
      return [];
    }

    // Mandatory courseId and isActive isolation filter
    const chromaQuery: Parameters<Collection['query']>[0] = {
      queryEmbeddings: [queryVector],
      nResults: topK,
      where: {
        $and: [{ courseId }, { isActive: true }],
      },
    };

    const queryResponse = (await this.queryCollectionWithRetry(
      chromaQuery,
    )) as ChromaQueryResult;

    const ids = queryResponse.ids?.[0] || [];
    const distances = queryResponse.distances?.[0] || [];
    const documents = queryResponse.documents?.[0] || [];

    if (ids.length === 0) {
      return [];
    }

    // Join with Postgres document_chunks table to retrieve the relational
    // chunk ID used by Tutor citation persistence.
    const chunkRows = (await this.dataSource.query(
      `SELECT id, vector_id, document_id, page_number, text_preview
         FROM document_chunks
        WHERE vector_id = ANY($1)
          AND is_active = true`,
      [ids],
    )) as unknown as DocumentChunkRow[];

    const chunkMap = new Map<string, DocumentChunkRow>();
    for (const row of chunkRows) {
      chunkMap.set(row.vector_id, row);
    }

    const results: RetrievedChunk[] = [];

    for (let i = 0; i < ids.length; i++) {
      const vectorId = ids[i];
      const distance = distances[i] ?? 0;
      const chromaDoc = documents[i] || '';
      const chunkRow = chunkMap.get(vectorId);

      // If document chunk is no longer active in Postgres, skip it
      if (!chunkRow) {
        continue;
      }

      results.push({
        chunkId: chunkRow.id,
        vectorId,
        documentId: chunkRow.document_id,
        page: chunkRow.page_number,
        excerpt: chromaDoc || chunkRow.text_preview,
        score: distance,
      });
    }

    return results;
  }

  /**
   * Queries ChromaDB vector store with mandatory video-level isolation
   * filter — scoped to a single video's transcript, not the whole course.
   *
   * Filter rule:
   * `where: { $and: [{ videoTranscriptId: input.videoTranscriptId }, { isActive: true }] }`
   *
   * Joins retrieved vector IDs with Postgres `video_chunks` to populate
   * exact `startSeconds`/`endSeconds` citation data.
   */
  async searchVideo(
    input: SearchVideoQueryInput,
  ): Promise<RetrievedVideoChunk[]> {
    const { videoTranscriptId, query, topK = 5 } = input;

    if (!videoTranscriptId) {
      throw new Error('Retrieval search failed: videoTranscriptId is required');
    }

    if (!query || !query.trim()) {
      return [];
    }

    const [queryVector] = await this.embeddingProvider.embed([query]);
    if (!queryVector || queryVector.length === 0) {
      return [];
    }

    // Mandatory videoTranscriptId and isActive isolation filter
    const chromaQuery: Parameters<Collection['query']>[0] = {
      queryEmbeddings: [queryVector],
      nResults: topK,
      where: {
        $and: [{ videoTranscriptId }, { isActive: true }],
      },
    };

    const queryResponse = (await this.queryCollectionWithRetry(
      chromaQuery,
    )) as ChromaQueryResult;

    const ids = queryResponse.ids?.[0] || [];
    const distances = queryResponse.distances?.[0] || [];
    const documents = queryResponse.documents?.[0] || [];

    if (ids.length === 0) {
      return [];
    }

    // Join with Postgres video_chunks table to retrieve the relational
    // chunk ID and timestamp citation data.
    const chunkRows = (await this.dataSource.query(
      `SELECT id, vector_id, video_transcript_id, start_seconds, end_seconds, text_preview
         FROM video_chunks
        WHERE vector_id = ANY($1)
          AND is_active = true`,
      [ids],
    )) as unknown as VideoChunkRow[];

    const chunkMap = new Map<string, VideoChunkRow>();
    for (const row of chunkRows) {
      chunkMap.set(row.vector_id, row);
    }

    const results: RetrievedVideoChunk[] = [];

    for (let i = 0; i < ids.length; i++) {
      const vectorId = ids[i];
      const distance = distances[i] ?? 0;
      const chromaDoc = documents[i] || '';
      const chunkRow = chunkMap.get(vectorId);

      // If video chunk is no longer active in Postgres, skip it
      if (!chunkRow) {
        continue;
      }

      results.push({
        chunkId: chunkRow.id,
        vectorId,
        videoTranscriptId: chunkRow.video_transcript_id,
        startSeconds: chunkRow.start_seconds,
        endSeconds: chunkRow.end_seconds,
        excerpt: chromaDoc || chunkRow.text_preview || '',
        score: distance,
      });
    }

    return results;
  }

  private async queryCollectionWithRetry(
    query: Parameters<Collection['query']>[0],
  ): Promise<unknown> {
    const collection = await this.getCollection();

    try {
      return await collection.query(query);
    } catch (error) {
      if (!isChromaNotFoundError(error)) {
        throw error;
      }

      this.logger.warn('Chroma collection handle was stale; reconnecting');
      this.collection = null;
      const refreshedCollection = await this.getCollection();
      return refreshedCollection.query(query);
    }
  }
}
