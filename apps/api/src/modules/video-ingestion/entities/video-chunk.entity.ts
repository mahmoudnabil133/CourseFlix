import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Mirrors `document_chunks`, keyed by caption timestamp instead of page
 * number. Full chunk text and embeddings live in ChromaDB; this table
 * bridges Postgres and the vector store, same as `document_chunks`.
 */
@Entity({ name: 'video_chunks' })
export class VideoChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'video_transcript_id', type: 'uuid' })
  videoTranscriptId!: string;

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex!: number;

  @Column({ name: 'text_preview', type: 'text', nullable: true })
  textPreview!: string | null;

  @Index()
  @Column({ name: 'vector_id', type: 'text' })
  vectorId!: string;

  @Column({ name: 'start_seconds', type: 'integer', nullable: true })
  startSeconds!: number | null;

  @Column({ name: 'end_seconds', type: 'integer', nullable: true })
  endSeconds!: number | null;

  @Column({ name: 'token_count', type: 'integer', nullable: true })
  tokenCount!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
