import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  DocumentEntity,
  DocumentProcessingStatus,
} from '../../modules/documents/entities/document.entity';
import { FileEntity } from '../../modules/documents/entities/file.entity';

interface DocumentBlueprint {
  fileName: string;
  status: DocumentProcessingStatus;
  version: number;
  errorMessage: string | null;
}

/**
 * One document per processing status, so the teacher Files tab shows every
 * row variant — including the retry button, which only renders on
 * `failed`, and the version badge, which only renders above version 1.
 *
 * Exported so `reset-check.ts` can verify live rows against the exact same
 * fixture data seeding uses, instead of duplicating it.
 */
export const DOCUMENT_BLUEPRINTS: DocumentBlueprint[] = [
  {
    fileName: 'ملخص-قوانين-نيوتن.pdf',
    status: 'completed',
    version: 1,
    errorMessage: null,
  },
  {
    fileName: 'مسائل-محلولة-الشغل-والطاقة.pdf',
    status: 'completed',
    version: 3,
    errorMessage: null,
  },
  {
    fileName: 'مذكرة-كمية-الحركة.pdf',
    status: 'processing',
    version: 1,
    errorMessage: null,
  },
  {
    fileName: 'امتحان-الفصل-الأول.pdf',
    status: 'pending',
    version: 1,
    errorMessage: null,
  },
  {
    fileName: 'ورقة-ممسوحة-ضوئيا.pdf',
    status: 'failed',
    version: 2,
    errorMessage:
      'تعذر استخراج أي نص من الملف — قد يكون ملفًا ممسوحًا ضوئيًا بدون طبقة نصية',
  },
];

/**
 * Seeds `files` + `documents` rows for the primary course.
 *
 * These rows are fixtures for the UI only: no bytes are written to
 * `STORAGE_ROOT` and no ingestion job is enqueued, because the worker that
 * would consume one doesn't exist yet. `storagePath` therefore points at a
 * clearly-fake path — nothing reads it, and a real upload through
 * `POST /teacher/courses/:courseId/documents` still stores properly.
 *
 * Safe to run on every reseed: upserts by (courseId, fileName), and forces
 * an already-present row back to its blueprint values so a rehearsal that
 * mutated one (clicking "retry" on the `failed` fixture) is undone rather
 * than left in place. Returns both counts so `reset` can report them.
 */
export async function seedDocuments(
  dataSource: DataSource,
  { courseId, teacherId }: { courseId: string; teacherId: string },
): Promise<{ created: number; reset: number }> {
  const documentRepository = dataSource.getRepository(DocumentEntity);
  const fileRepository = dataSource.getRepository(FileEntity);
  let created = 0;
  let reset = 0;

  for (const blueprint of DOCUMENT_BLUEPRINTS) {
    const existing = await documentRepository.findOne({
      where: { courseId, fileName: blueprint.fileName },
    });

    if (existing) {
      // Force the row back to its blueprint values — a rehearsal/demo run
      // may have mutated status/version/errorMessage (e.g. clicking retry),
      // and a real "reset" must undo that, not just fill gaps.
      const alreadyMatches =
        existing.processingStatus === blueprint.status &&
        existing.version === blueprint.version &&
        existing.errorMessage === blueprint.errorMessage;

      if (!alreadyMatches) {
        await documentRepository.update(existing.id, {
          processingStatus: blueprint.status,
          version: blueprint.version,
          errorMessage: blueprint.errorMessage,
        });
        reset += 1;
      }
      continue;
    }

    // Deterministic so a reseed against a wiped DB reproduces byte-identical
    // checksums, and so no two fixtures collide on the dedup index.
    const checksum = createHash('sha256')
      .update(blueprint.fileName)
      .digest('hex');

    const file = await fileRepository.save(
      fileRepository.create({
        fileName: blueprint.fileName,
        mimeType: 'application/pdf',
        sizeBytes: String(180_000 + blueprint.fileName.length * 1_000),
        storageProvider: 'local',
        storagePath: `seed-fixture/${checksum}`,
        checksum,
        uploadedBy: teacherId,
      }),
    );

    const savedDoc = await documentRepository.save(
      documentRepository.create({
        courseId,
        uploadedBy: teacherId,
        fileId: file.id,
        fileName: blueprint.fileName,
        fileType: 'pdf',
        processingStatus: blueprint.status,
        checksum,
        version: blueprint.version,
        errorMessage: blueprint.errorMessage,
      }),
    );
    created += 1;

    // Seed document_chunks for completed documents so Tutor has grounded physics knowledge
    if (blueprint.status === 'completed') {
      await seedDocumentChunksForDoc(
        dataSource,
        savedDoc.id,
        blueprint.fileName,
      );
    }
  }

  // Also ensure completed documents already existing get their chunks seeded
  const completedDocs = await documentRepository.find({
    where: { processingStatus: 'completed' },
  });

  for (const doc of completedDocs) {
    await seedDocumentChunksForDoc(dataSource, doc.id, doc.fileName);
  }

  return { created, reset };
}

async function seedDocumentChunksForDoc(
  dataSource: DataSource,
  documentId: string,
  fileName: string,
): Promise<void> {
  const existingChunks = await dataSource.query(
    `SELECT id FROM document_chunks WHERE document_id = $1`,
    [documentId],
  );

  if (existingChunks.length > 0) {
    return;
  }

  const sampleChunksMap: Record<
    string,
    Array<{ page: number; text: string }>
  > = {
    'ملخص-قوانين-نيوتن.pdf': [
      {
        page: 1,
        text: 'قانون نيوتن الأول (قانون القصور الذاتي): يظل الجسم على حالته من السكون أو الحركة المنتظمة في خط مستقيم ما لم تؤثر عليه قوة محصلة خارجية تغير من حالته.',
      },
      {
        page: 2,
        text: 'قانون نيوتن الثاني: القوة المحصلة المؤثرة على جسم تساوي حاصل ضرب كتلة الجسم في عجلة تسارعه، بالصيغة الرياضية F = m * a. تقاس القوة بوحدة نيوتن.',
      },
      {
        page: 3,
        text: 'قانون نيوتن الثالث: لكل قوة فعل قوة رد فعل مساوية لها في المقدار ومضادة لها في الاتجاه، وتعملان على جسمين مختلفين وفي نفس الوقت.',
      },
    ],
    'مسائل-محلولة-الشغل-والطاقة.pdf': [
      {
        page: 1,
        text: 'الشغل والطاقة الحركية: الشغل المبذول بواسطة قوة ثابتة تحرك جسماً إزاحة d يعطى بالمعادلة W = F * d * cos(theta). الطاقة الحركية تساوي KE = 0.5 * m * v^2.',
      },
      {
        page: 2,
        text: 'قانون حفظ الطاقة الميكانيكية: الطاقة لا تفنى ولا تستحدث من العدم ولكنها تتحول من شكل لآخر. المجموع الكلي لطاقة الوضع والطاقة الحركية يبقى ثابتاً.',
      },
    ],
    default: [
      {
        page: 1,
        text: 'مقدمة في الكهرومغناطيسية وقانون كولوم: ينص قانون كولوم على أن التجاذب أو التنافر بين شحنتين تناسب طردياً مع حاصل ضرب الشحنتين وعكسياً مع مربع المسافة F = k * |q1 * q2| / r^2.',
      },
      {
        page: 2,
        text: 'المجال الكهربي والجهد الكهربي: شدة المجال الكهربي الناشئ عن شحنة نقطية يحسب بالقانون E = k * |Q| / r^2 ويكون اتجاهه خارجاً من الشحنة الموجبة وداخلاً للشحنة السالبة.',
      },
    ],
  };

  const chunks = sampleChunksMap[fileName] || sampleChunksMap['default'];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const vectorId = `${documentId}:1:${index}`;

    await dataSource.query(
      `INSERT INTO document_chunks (
        document_id, chunk_index, text_preview, vector_id, page_number, token_count, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [
        documentId,
        index,
        chunk.text,
        vectorId,
        chunk.page,
        Math.ceil(chunk.text.length / 4),
      ],
    );
  }
}
