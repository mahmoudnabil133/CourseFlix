import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ChromaAdapter } from '../adapters/chroma.adapter';
import {
  EXAM_LLM_PROVIDER,
  GeneratedQuestion,
} from '../adapters/exam-llm.adapter';
import type { ExamLlmProvider } from '../adapters/exam-llm.adapter';
import {
  buildExamGenerationPrompt,
  PreviousDraftQuestion,
  QuestionSpecItem,
} from '../prompt/exam-generation-prompt';
import type { NotificationProducerPort } from '../common/ports/notification-producer.port';
import { NOTIFICATION_PRODUCER_PORT } from '../common/ports/notification-producer.port';

export interface ExamGenerationJobPayload {
  jobId: string;
}

type ScopeType = 'lesson' | 'section' | 'course';

interface RequestRecord {
  id: string;
  course_id: string;
  scope_type: ScopeType;
  scope_id: string;
  teacher_id: string;
  quiz_id: string | null;
  difficulty: string;
  question_spec: QuestionSpecItem[];
  due_at: string;
  attempt_number: number;
}

interface JobRecord {
  target_entity_type: string;
  target_entity_id: string;
}

// Keeps the prompt within a sane size regardless of how much content a
// course/section has — chunks are taken in stable order until the
// budget runs out rather than truncating mid-chunk.
const MAX_CONTENT_CHARS = 60_000;

/**
 * BullMQ processor for the "teacher asks the AI for an exam" workflow:
 * resolve the requested scope (lesson/section/course) → collect every
 * active document/video chunk in it → ask the LLM for exactly the
 * requested question breakdown → validate the shape → write a
 * 'pending_review' quiz draft. A regenerate-with-feedback attempt
 * (`attempt_number > 1`) additionally feeds the previous draft and the
 * full feedback thread back into the prompt and replaces the same
 * quiz's questions in place instead of creating a new quiz.
 */
@Processor('exam-generation')
@Injectable()
export class ExamGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ExamGenerationProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly chromaAdapter: ChromaAdapter,
    @Inject(EXAM_LLM_PROVIDER)
    private readonly llmProvider: ExamLlmProvider,
    @Inject(NOTIFICATION_PRODUCER_PORT)
    private readonly notificationProducer: NotificationProducerPort,
  ) {
    super();
  }

  async process(job: Job<ExamGenerationJobPayload>): Promise<void> {
    const { jobId } = job.data;
    this.logger.log(`[${job.id}] picked up ai_jobs row ${jobId}`);

    const claimed = await this.claim(jobId);
    if (!claimed) {
      this.logger.warn(
        `[${job.id}] ai_jobs row ${jobId} already claimed or completed — skipping`,
      );
      return;
    }

    let request: RequestRecord | null = null;

    try {
      const jobRecord = await this.getJobRecord(jobId);
      if (!jobRecord || jobRecord.target_entity_type !== 'quiz_generation_request') {
        throw new Error(`Invalid job target entity for ai_jobs row ${jobId}`);
      }

      request = await this.getRequestRecord(jobRecord.target_entity_id);
      if (!request) {
        throw new Error(
          `quiz_generation_request not found for ID ${jobRecord.target_entity_id}`,
        );
      }

      await this.markRequestProcessing(request.id);

      const content = await this.gatherScopeContent(request);
      if (!content) {
        throw new Error(
          'لا يوجد محتوى معالج (مستندات أو فيديوهات) في هذا الجزء بعد — تأكد أن الملفات/الفيديوهات انتهت من المعالجة.',
        );
      }

      const previousDraft =
        request.attempt_number > 1
          ? await this.loadPreviousDraft(request.quiz_id)
          : undefined;
      const feedback =
        request.attempt_number > 1
          ? await this.loadFeedbackThread(request.id)
          : undefined;

      const prompt = buildExamGenerationPrompt({
        content,
        difficulty: request.difficulty,
        questionSpec: request.question_spec,
        previousDraft,
        feedback,
      });

      const result = await this.llmProvider.generateExam({
        prompt,
        questionSpec: request.question_spec,
        difficulty: request.difficulty,
      });

      this.validateQuestions(result.questions, request.question_spec);

      const quizId = await this.persistDraft(request, result.questions);

      await this.markCompleted(jobId);
      await this.markRequestPendingReview(request.id, quizId);

      await this.notificationProducer.notify({
        userId: request.teacher_id,
        type: 'exam_generation_ready',
        title: 'الاختبار المولّد بالذكاء الاصطناعي جاهز للمراجعة',
        message: 'انتهى الذكاء الاصطناعي من إعداد الاختبار، راجعه واقبله أو اطلب تعديله.',
        relatedEntityType: 'quiz_generation_request',
        relatedEntityId: request.id,
      });

      this.logger.log(
        `[${job.id}] ai_jobs row ${jobId} (request ${request.id}) → completed`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[${job.id}] ai_jobs row ${jobId} → failed: ${message}`,
      );

      await this.markFailed(jobId, message);

      if (request) {
        await this.markRequestFailed(request.id, message);
        await this.notificationProducer.notify({
          userId: request.teacher_id,
          type: 'exam_generation_failed',
          title: 'تعذّر إنشاء الاختبار بالذكاء الاصطناعي',
          message,
          relatedEntityType: 'quiz_generation_request',
          relatedEntityId: request.id,
        });
      }

      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Content gathering
  // ---------------------------------------------------------------------------

  private async gatherScopeContent(request: RequestRecord): Promise<string | null> {
    const documentIds = await this.resolveDocumentIds(request);
    const videoTranscriptIds = await this.resolveVideoTranscriptIds(request);

    const vectorIds: string[] = [];

    if (documentIds.length > 0) {
      const rows = (await this.dataSource.query(
        `SELECT vector_id FROM document_chunks
          WHERE document_id = ANY($1) AND is_active = true
          ORDER BY document_id, chunk_index`,
        [documentIds],
      )) as unknown as Array<{ vector_id: string }>;
      vectorIds.push(...rows.map((r) => r.vector_id));
    }

    if (videoTranscriptIds.length > 0) {
      const rows = (await this.dataSource.query(
        `SELECT vector_id FROM video_chunks
          WHERE video_transcript_id = ANY($1) AND is_active = true
          ORDER BY video_transcript_id, chunk_index`,
        [videoTranscriptIds],
      )) as unknown as Array<{ vector_id: string }>;
      vectorIds.push(...rows.map((r) => r.vector_id));
    }

    if (vectorIds.length === 0) {
      return null;
    }

    const collection = await this.chromaAdapter.getCollection();
    const got = (await collection.get({ ids: vectorIds })) as unknown as {
      ids?: string[];
      documents?: (string | null)[];
    };

    const texts = (got.documents ?? []).filter((text): text is string => Boolean(text));

    let budget = MAX_CONTENT_CHARS;
    const included: string[] = [];
    for (const text of texts) {
      if (budget <= 0) break;
      const slice = text.slice(0, budget);
      included.push(slice);
      budget -= slice.length;
    }

    return included.length > 0 ? included.join('\n\n') : null;
  }

  private async resolveDocumentIds(request: RequestRecord): Promise<string[]> {
    const column =
      request.scope_type === 'lesson'
        ? 'lesson_id'
        : request.scope_type === 'section'
          ? 'section_id'
          : 'course_id';
    const scopeValue = request.scope_type === 'course' ? request.course_id : request.scope_id;

    const rows = (await this.dataSource.query(
      `SELECT id FROM documents
        WHERE ${column} = $1 AND deleted_at IS NULL AND processing_status = 'completed'`,
      [scopeValue],
    )) as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  private async resolveVideoTranscriptIds(request: RequestRecord): Promise<string[]> {
    const column =
      request.scope_type === 'lesson'
        ? 'lesson_id'
        : request.scope_type === 'section'
          ? 'section_id'
          : 'course_id';
    const scopeValue = request.scope_type === 'course' ? request.course_id : request.scope_id;

    const rows = (await this.dataSource.query(
      `SELECT id FROM video_transcripts
        WHERE ${column} = $1 AND processing_status = 'completed'`,
      [scopeValue],
    )) as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------------------------
  // Regeneration context
  // ---------------------------------------------------------------------------

  private async loadPreviousDraft(
    quizId: string | null,
  ): Promise<PreviousDraftQuestion[] | undefined> {
    if (!quizId) return undefined;

    const rows = (await this.dataSource.query(
      `SELECT q.type, q.text, q.options, q.correct_answer AS "correctAnswer"
         FROM quiz_questions qq
         JOIN questions q ON q.id = qq.question_id
        WHERE qq.quiz_id = $1
        ORDER BY qq.order_index`,
      [quizId],
    )) as unknown as PreviousDraftQuestion[];
    return rows;
  }

  private async loadFeedbackThread(requestId: string): Promise<string[]> {
    const rows = (await this.dataSource.query(
      `SELECT message FROM quiz_generation_feedback
        WHERE request_id = $1
        ORDER BY created_at ASC`,
      [requestId],
    )) as unknown as Array<{ message: string }>;
    return rows.map((r) => r.message);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private validateQuestions(
    questions: GeneratedQuestion[],
    spec: QuestionSpecItem[],
  ): void {
    for (const item of spec) {
      const actual = questions.filter((q) => q.type === item.type).length;
      if (actual !== item.count) {
        throw new Error(
          `الذكاء الاصطناعي أنشأ ${actual} سؤال من نوع "${item.type}" بدلاً من ${item.count} المطلوبة.`,
        );
      }
    }

    for (const question of questions) {
      if (!question.text?.trim()) {
        throw new Error('سؤال بدون نص تم إنشاؤه — حاول مرة أخرى.');
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`سؤال "${question.text}" بدون اختيارات كافية.`);
      }
      if (!question.options.includes(question.correctAnswer)) {
        throw new Error(
          `الإجابة الصحيحة لسؤال "${question.text}" غير موجودة ضمن الاختيارات.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private async persistDraft(
    request: RequestRecord,
    questions: GeneratedQuestion[],
  ): Promise<string> {
    const { sectionId, lessonId } = await this.resolvePlacement(request);

    const questionIds: string[] = [];
    for (const question of questions) {
      const id = randomUUID();
      await this.dataSource.query(
        `INSERT INTO questions (id, course_id, type, text, options, correct_answer, difficulty)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          request.course_id,
          question.type,
          question.text,
          question.options,
          question.correctAnswer,
          question.difficulty,
        ],
      );
      questionIds.push(id);
    }

    const quizId = request.quiz_id ?? randomUUID();

    if (request.quiz_id) {
      await this.dataSource.query(
        `UPDATE quizzes
            SET status = 'pending_review', version = version + 1, updated_at = NOW()
          WHERE id = $1`,
        [quizId],
      );
      await this.dataSource.query(
        `DELETE FROM quiz_questions WHERE quiz_id = $1`,
        [quizId],
      );
    } else {
      // QuizEntity.generationType now maps to generation_type (fixed in
      // 482c616 — the column used to be camelCase with no explicit
      // `name:`, since renamed to match every other column in this
      // schema). Verified against the live DB (`\d quizzes`).
      await this.dataSource.query(
        `INSERT INTO quizzes (
          id, course_id, section_id, lesson_id, created_by, generation_type,
          title, status, due_at, version
        ) VALUES ($1, $2, $3, $4, NULL, 'rag_generated', $5, 'pending_review', $6, 1)`,
        [
          quizId,
          request.course_id,
          sectionId,
          lessonId,
          this.buildTitle(request),
          request.due_at,
        ],
      );
    }

    for (const [index, questionId] of questionIds.entries()) {
      await this.dataSource.query(
        `INSERT INTO quiz_questions (quiz_id, question_id, order_index) VALUES ($1, $2, $3)`,
        [quizId, questionId, index],
      );
    }

    return quizId;
  }

  private buildTitle(request: RequestRecord): string {
    const scopeLabel =
      request.scope_type === 'lesson'
        ? 'الدرس'
        : request.scope_type === 'section'
          ? 'القسم'
          : 'الدورة';
    return `اختبار مولّد بالذكاء الاصطناعي — ${scopeLabel}`;
  }

  private async resolvePlacement(
    request: RequestRecord,
  ): Promise<{ sectionId: string | null; lessonId: string | null }> {
    if (request.scope_type === 'course') {
      return { sectionId: null, lessonId: null };
    }
    if (request.scope_type === 'section') {
      return { sectionId: request.scope_id, lessonId: null };
    }

    const rows = (await this.dataSource.query(
      `SELECT section_id FROM lessons WHERE id = $1`,
      [request.scope_id],
    )) as unknown as Array<{ section_id: string }>;
    return { sectionId: rows[0]?.section_id ?? null, lessonId: request.scope_id };
  }

  // ---------------------------------------------------------------------------
  // SQL Helpers
  // ---------------------------------------------------------------------------

  private async claim(jobId: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `UPDATE ai_jobs
          SET status = 'processing', started_at = NOW()
        WHERE id = $1
          AND status IN ('queued', 'failed')
        RETURNING id`,
      [jobId],
    )) as unknown as Array<{ id: string }>;
    return rows.length > 0;
  }

  private async getJobRecord(jobId: string): Promise<JobRecord | null> {
    const rows = (await this.dataSource.query(
      `SELECT target_entity_type, target_entity_id FROM ai_jobs WHERE id = $1`,
      [jobId],
    )) as unknown as JobRecord[];
    return rows[0] || null;
  }

  private async getRequestRecord(requestId: string): Promise<RequestRecord | null> {
    const rows = (await this.dataSource.query(
      `SELECT id, course_id, scope_type, scope_id, teacher_id, quiz_id,
              difficulty, question_spec, due_at, attempt_number
         FROM quiz_generation_requests
        WHERE id = $1`,
      [requestId],
    )) as unknown as RequestRecord[];
    return rows[0] || null;
  }

  private async markCompleted(jobId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_jobs SET status = 'completed', finished_at = NOW() WHERE id = $1`,
      [jobId],
    );
  }

  private async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_jobs
          SET status = 'failed', finished_at = NOW(), error_message = $2, retries = retries + 1
        WHERE id = $1`,
      [jobId, errorMessage],
    );
  }

  private async markRequestProcessing(requestId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE quiz_generation_requests SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );
  }

  private async markRequestPendingReview(requestId: string, quizId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE quiz_generation_requests
          SET status = 'pending_review', quiz_id = $2, error_message = NULL, updated_at = NOW()
        WHERE id = $1`,
      [requestId, quizId],
    );
  }

  private async markRequestFailed(requestId: string, errorMessage: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE quiz_generation_requests
          SET status = 'failed', error_message = $2, updated_at = NOW()
        WHERE id = $1`,
      [requestId, errorMessage],
    );
  }
}
