import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INTERVENTION_EVALUATOR_PORT,
  InterventionEvaluatorPort,
} from '../../common/ports/intervention-evaluator.port';
import {
  RETRIEVAL_PORT,
  RetrievedChunk,
  RetrievalPort,
} from '../../common/ports/retrieval.port';
import { DocumentEntity } from '../documents/entities/document.entity';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import {
  LLM_PROVIDER,
  LlmGenerateResult,
  LlmProvider,
} from './adapters/llm.adapter';
import { ConversationsService } from './conversations.service';
import {
  buildGroundedTutorPrompt,
  GROUNDED_TUTOR_PROMPT_VERSION,
} from './prompt/grounded-prompt.template';
import { AnswerPolicyService } from './prompt/answer-policy.service';

export interface TutorCitation {
  documentId: string;
  documentName: string;
  page: number;
  excerpt: string;
}

export interface TutorMessageResponse {
  messageId: string;
  status: 'answered' | 'no_answer';
  answer: string;
  citations: TutorCitation[];
}

export interface TutorHistoryMessage {
  id: string;
  role: 'student' | 'assistant';
  text: string;
  createdAt: string;
}

const NO_ANSWER_MESSAGE = 'المواد المرفوعة لا تغطي هذا السؤال بعد.';
const ASSISTANT_IDENTITY_MESSAGE =
  'أنا سيف، مساعدك الذكي في CourseFlix. أقدر أساعدك في شرح وتلخيص مواد الدورة المرفوعة، توضيح النقاط الصعبة، الإجابة عن أسئلة الدروس، وتجهيز مراجعة سريعة من محتوى الكورس. اسألني عن أي جزء في ملفات الدورة وسأجاوبك بالمصادر المتاحة.';
const OUT_OF_SCOPE_MESSAGE =
  'أنا سيف، مساعدك الذكي لمحتوى هذه الدورة فقط. لا أستطيع الإجابة عن أسئلة خارج المواد المرفوعة هنا، لكن اسألني عن درس أو ملف في الكورس وسأساعدك بالمصادر.';

const IDENTITY_PATTERNS = [
  /\b(hi|hello|hey)\b/i,
  /السلام عليكم|مرحبا|أهلا|أهلاً|اهلا|هاي/i,
  /مين\s+انت|من\s+انت|اسمك|تعرف\s+نفسك/i,
  /تقدر\s+تساعد|تساعدني\s+ازاي|تساعدني\s+إزاي|تعمل\s+ايه|تعمل\s+إيه|what can you do|who are you/i,
];

const EXPLICIT_OUT_OF_SCOPE_PATTERNS = [
  /نكتة|هزار|ضحكني|joke/i,
  /الطقس|weather/i,
  /الأخبار|الاخبار|news/i,
  /رئيس|انتخابات|سياسة|politics|president/i,
  /طبخة|وصفة|recipe/i,
  /اكتب\s+(كود|code)|برمج|programming/i,
  /تشخيص|علاج|دواء|medical|diagnose/i,
  /محامي|قانوني|legal/i,
];

type TutorDirectIntent = 'identity' | 'out_of_scope' | null;

function getDirectTutorIntent(question: string): TutorDirectIntent {
  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(question))) {
    return 'identity';
  }

  if (
    EXPLICIT_OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(question))
  ) {
    return 'out_of_scope';
  }

  return null;
}

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly conversationsService: ConversationsService,
    private readonly answerPolicyService: AnswerPolicyService,
    @Inject(RETRIEVAL_PORT)
    private readonly retrievalPort: RetrievalPort,
    @Inject(LLM_PROVIDER)
    private readonly llmProvider: LlmProvider,
    @InjectRepository(DocumentEntity)
    private readonly documentsRepository: Repository<DocumentEntity>,
    @Inject(INTERVENTION_EVALUATOR_PORT)
    private readonly interventionEvaluator: InterventionEvaluatorPort,
  ) {}

  async sendMessage(input: {
    courseId: string;
    studentId: string;
    message: string;
  }): Promise<TutorMessageResponse> {
    const question = input.message.trim();
    if (!question) {
      throw new BadRequestException('Message cannot be empty.');
    }

    await this.enrollmentsService.assertStudentEnrolled(
      input.studentId,
      input.courseId,
    );

    const conversation =
      await this.conversationsService.getOrCreateActiveConversation(
        input.studentId,
        input.courseId,
      );

    // Gathered before saving the current message, so a repeated-question
    // check never matches the message against itself.
    const priorMessageTexts = (
      await this.conversationsService.listCourseMessages(
        input.studentId,
        input.courseId,
      )
    )
      .filter((message) => message.senderType === 'student')
      .map((message) => message.messageText);

    const studentMessage = await this.conversationsService.saveMessage({
      conversationId: conversation.id,
      senderType: 'student',
      role: 'user',
      messageText: question,
    });

    // Struggle-signal evaluation is a secondary side effect — it must
    // never fail or delay the primary Tutor response.
    this.interventionEvaluator
      .evaluateSignal({
        kind: 'chat_message',
        studentId: input.studentId,
        courseId: input.courseId,
        messageText: question,
        priorMessageTexts,
        evidenceRefId: studentMessage.id,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Intervention evaluation failed for message=${studentMessage.id}: ${String(error)}`,
        );
      });

    const directIntent = getDirectTutorIntent(question);
    if (directIntent === 'identity') {
      const assistantMessage = await this.persistDirectAnswer(
        conversation.id,
        ASSISTANT_IDENTITY_MESSAGE,
      );
      return {
        messageId: assistantMessage.id,
        status: 'answered',
        answer: ASSISTANT_IDENTITY_MESSAGE,
        citations: [],
      };
    }

    if (directIntent === 'out_of_scope') {
      const assistantMessage = await this.persistNoAnswer(
        conversation.id,
        OUT_OF_SCOPE_MESSAGE,
      );
      return {
        messageId: assistantMessage.id,
        status: 'no_answer',
        answer: OUT_OF_SCOPE_MESSAGE,
        citations: [],
      };
    }

    const retrievedChunks = await this.retrievalPort.search({
      courseId: input.courseId,
      query: question,
      topK: 5,
    });
    const relevantChunks =
      this.answerPolicyService.getRelevantChunks(retrievedChunks);

    if (relevantChunks.length === 0) {
      const assistantMessage = await this.persistNoAnswer(conversation.id);
      this.logger.log(
        `Tutor no_answer trace: messageId=${assistantMessage.id} courseId=${input.courseId} chunks=${retrievedChunks.length}`,
      );
      return {
        messageId: assistantMessage.id,
        status: 'no_answer',
        answer: NO_ANSWER_MESSAGE,
        citations: [],
      };
    }

    const prompt = buildGroundedTutorPrompt({
      question,
      chunks: relevantChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        page: chunk.page,
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
        `Tutor provider failure courseId=${input.courseId} provider=${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new ServiceUnavailableException(
        'Tutor is temporarily unavailable. Please try again.',
      );
    }

    const citations = await this.buildValidatedCitations(
      llmResult.citedChunkIds,
      relevantChunks,
    );

    if (citations.length === 0) {
      const assistantMessage = await this.persistNoAnswer(
        conversation.id,
        NO_ANSWER_MESSAGE,
        llmResult,
      );
      this.logger.log(
        `Tutor downgraded to no_answer trace: messageId=${assistantMessage.id} courseId=${input.courseId}`,
      );
      return {
        messageId: assistantMessage.id,
        status: 'no_answer',
        answer: NO_ANSWER_MESSAGE,
        citations: [],
      };
    }

    const assistantMessage = await this.conversationsService.saveMessage({
      conversationId: conversation.id,
      senderType: 'ai_tutor',
      role: 'assistant',
      messageText: llmResult.answer,
      modelName: llmResult.modelName,
      provider: llmResult.provider,
      promptVersion: GROUNDED_TUTOR_PROMPT_VERSION,
      tokensUsed: llmResult.tokensUsed,
    });

    const chunksById = new Map(
      relevantChunks.map((chunk) => [chunk.chunkId, chunk]),
    );
    await this.conversationsService.saveSourceChunks(
      citations
        .map((citation) => chunksById.get(citation.chunkId))
        .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
        .map((chunk) => ({
          messageId: assistantMessage.id,
          chunkId: chunk.chunkId,
          relevanceScore: chunk.score,
          excerpt: chunk.excerpt,
          vectorId: chunk.vectorId,
        })),
    );

    this.logger.log(
      `Tutor answered trace: messageId=${assistantMessage.id} courseId=${input.courseId} citations=${citations.length} model=${llmResult.modelName}`,
    );

    return {
      messageId: assistantMessage.id,
      status: 'answered',
      answer: llmResult.answer,
      citations: citations.map(
        ({ chunkId: _chunkId, ...citation }) => citation,
      ),
    };
  }

  async getCourseMessages(input: {
    courseId: string;
    studentId: string;
  }): Promise<TutorHistoryMessage[]> {
    await this.enrollmentsService.assertStudentEnrolled(
      input.studentId,
      input.courseId,
    );

    const messages = await this.conversationsService.listCourseMessages(
      input.studentId,
      input.courseId,
    );

    return messages.map((message) => ({
      id: message.id,
      role: message.senderType === 'student' ? 'student' : 'assistant',
      text: message.messageText,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  private async persistNoAnswer(
    conversationId: string,
    messageText = NO_ANSWER_MESSAGE,
    llmResult?: LlmGenerateResult,
  ) {
    return this.conversationsService.saveMessage({
      conversationId,
      senderType: 'ai_tutor',
      role: 'assistant',
      messageText,
      modelName: llmResult?.modelName ?? null,
      provider: llmResult?.provider ?? null,
      promptVersion: GROUNDED_TUTOR_PROMPT_VERSION,
      tokensUsed: llmResult?.tokensUsed ?? null,
    });
  }

  private async persistDirectAnswer(
    conversationId: string,
    messageText: string,
  ) {
    return this.conversationsService.saveMessage({
      conversationId,
      senderType: 'ai_tutor',
      role: 'assistant',
      messageText,
      modelName: null,
      provider: null,
      promptVersion: GROUNDED_TUTOR_PROMPT_VERSION,
      tokensUsed: null,
    });
  }

  private async buildValidatedCitations(
    citedChunkIds: string[],
    relevantChunks: RetrievedChunk[],
  ): Promise<Array<TutorCitation & { chunkId: string }>> {
    const chunksById = new Map(
      relevantChunks.map((chunk) => [chunk.chunkId, chunk]),
    );
    const validChunks = Array.from(
      new Set(citedChunkIds.map((id) => chunksById.get(id)).filter(Boolean)),
    ) as RetrievedChunk[];

    if (validChunks.length === 0) {
      return [];
    }

    const documents = await this.documentsRepository.find({
      where: { id: In(validChunks.map((chunk) => chunk.documentId)) },
    });
    const documentNames = new Map(
      documents.map((document) => [document.id, document.fileName]),
    );

    return validChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      documentName: documentNames.get(chunk.documentId) ?? 'مستند الدورة',
      page: chunk.page,
      excerpt: chunk.excerpt,
    }));
  }
}
