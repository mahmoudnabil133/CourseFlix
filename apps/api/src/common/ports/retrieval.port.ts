export const RETRIEVAL_PORT = Symbol('RETRIEVAL_PORT');

export interface SearchQueryInput {
  courseId: string;
  query: string;
  topK?: number;
}

export interface RetrievedChunk {
  /**
   * Postgres `document_chunks.id`. Use this for relational persistence.
   */
  chunkId: string;
  /**
   * Vector-store ID used to bridge ChromaDB and Postgres.
   */
  vectorId: string;
  documentId: string;
  page: number;
  excerpt: string;
  score: number;
}

export interface SearchVideoQueryInput {
  videoTranscriptId: string;
  query: string;
  topK?: number;
}

export interface RetrievedVideoChunk {
  /**
   * Postgres `video_chunks.id`. Use this for relational persistence.
   */
  chunkId: string;
  /**
   * Vector-store ID used to bridge ChromaDB and Postgres.
   */
  vectorId: string;
  videoTranscriptId: string;
  startSeconds: number | null;
  endSeconds: number | null;
  excerpt: string;
  score: number;
}

export interface RetrievalPort {
  search(input: SearchQueryInput): Promise<RetrievedChunk[]>;
  searchVideo(input: SearchVideoQueryInput): Promise<RetrievedVideoChunk[]>;
}
