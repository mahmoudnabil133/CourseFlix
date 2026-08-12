import { ConfigService } from '@nestjs/config';
import { ChromaClient } from 'chromadb';
import AppDataSource from './data-source';
import { OpenAIEmbeddingProvider } from '../modules/retrieval/embedding.adapter';

interface DocumentChunkRow {
  id: string;
  vector_id: string;
  document_id: string;
  page_number: number;
  text_preview: string;
  course_id: string;
}

export async function reEmbedDocumentChunks(): Promise<number> {
  const isInitialized = AppDataSource.isInitialized;
  if (!isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    const configService = new ConfigService();
    const embeddingProvider = new OpenAIEmbeddingProvider(configService);

    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    const collectionName = process.env.CHROMA_COLLECTION || 'courseflix-dev';

    const client = new ChromaClient({ path: chromaUrl });
    const collection = await client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: {
        name: 'courseflix-explicit-embeddings',
        async generate() {
          throw new Error('CourseFlix passes embeddings explicitly');
        },
      },
    });

    const chunks = await AppDataSource.query(
      `SELECT c.id, c.vector_id, c.document_id, c.page_number, c.text_preview, d.course_id
         FROM document_chunks c
         JOIN documents d ON c.document_id = d.id
        WHERE c.is_active = true`,
    );

    if (chunks.length === 0) {
      console.log('No active document chunks found to re-embed.');
      return 0;
    }

    console.log(
      `Re-embedding ${chunks.length} document chunks using OpenAI embeddings...`,
    );

    const BATCH_SIZE = 20;
    let processed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map((c) => c.text_preview);

      const embeddings = await embeddingProvider.embed(texts);

      const ids = batch.map((c) => c.vector_id);
      const documents = texts;
      const metadatas = batch.map((c) => ({
        courseId: c.course_id,
        documentId: c.document_id,
        page: c.page_number,
        isActive: true,
        version: 1,
      }));

      await collection.upsert({
        ids,
        embeddings,
        documents,
        metadatas,
      });

      processed += batch.length;
      console.log(`Processed ${processed}/${chunks.length} chunks...`);
    }

    console.log(
      `Successfully re-embedded ${processed} document chunks in ChromaDB.`,
    );
    return processed;
  } finally {
    if (!isInitialized && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

if (require.main === module) {
  reEmbedDocumentChunks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Re-embedding failed:', err);
      process.exit(1);
    });
}
