import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QuestionSpecItem } from '../prompt/exam-generation-prompt';

export const EXAM_LLM_PROVIDER = Symbol('EXAM_LLM_PROVIDER');

export interface GeneratedQuestion {
  type: string;
  text: string;
  options: string[];
  correctAnswer: string;
  difficulty: string;
}

export interface ExamLlmGenerateInput {
  prompt: string;
  questionSpec: QuestionSpecItem[];
  difficulty: string;
}

export interface ExamLlmGenerateResult {
  questions: GeneratedQuestion[];
  modelName: string;
  provider: string;
  tokensUsed: number;
}

export interface ExamLlmProvider {
  generateExam(input: ExamLlmGenerateInput): Promise<ExamLlmGenerateResult>;
}

const TRUE_FALSE_OPTIONS = ['صح', 'خطأ'];

/**
 * Deterministic, offline exam generator for local dev/tests without an
 * API key — mirrors `MockEmbeddingProvider`/`MockLlmProvider` elsewhere
 * in the codebase. Fabricates exactly the requested count per type so
 * the rest of the pipeline (validation, persistence, review flow) can
 * be exercised without a real LLM call.
 */
export class MockExamLlmProvider implements ExamLlmProvider {
  generateExam(input: ExamLlmGenerateInput): Promise<ExamLlmGenerateResult> {
    const questions: GeneratedQuestion[] = [];

    for (const spec of input.questionSpec) {
      for (let i = 0; i < spec.count; i++) {
        if (spec.type === 'true_false') {
          questions.push({
            type: 'true_false',
            text: `(تجريبي) عبارة رقم ${i + 1} مبنية على محتوى المادة المرفوعة.`,
            options: TRUE_FALSE_OPTIONS,
            correctAnswer: TRUE_FALSE_OPTIONS[i % 2],
            difficulty: input.difficulty,
          });
        } else {
          questions.push({
            type: 'mcq',
            text: `(تجريبي) سؤال رقم ${i + 1} مبني على محتوى المادة المرفوعة.`,
            options: ['الإجابة الصحيحة', 'خيار أول', 'خيار ثانٍ', 'خيار ثالث'],
            correctAnswer: 'الإجابة الصحيحة',
            difficulty: input.difficulty,
          });
        }
      }
    }

    return Promise.resolve({
      questions,
      modelName: 'mock-courseflix-exam',
      provider: 'mock',
      tokensUsed: Math.max(1, Math.ceil(input.prompt.length / 4)),
    });
  }
}

interface OpenAIResponsePayload {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: { total_tokens?: number };
}

interface ExamGenerationJson {
  questions?: unknown;
}

/**
 * Real exam-generation provider, same OpenAI Responses API shape as
 * `apps/api/src/modules/tutor/adapters/llm.adapter.ts`'s
 * `OpenAILlmProvider` — duplicated rather than shared because the API
 * and worker are separate deployable apps with no shared package.
 */
@Injectable()
export class OpenAIExamLlmProvider implements ExamLlmProvider {
  private readonly logger = new Logger(OpenAIExamLlmProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateExam(input: ExamLlmGenerateInput): Promise<ExamLlmGenerateResult> {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL') || 'gpt-5.6';

    if (!apiKey || apiKey === 'replace-me') {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set a valid API key or use MockExamLlmProvider.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Return only compact JSON with a single "questions" key, no prose, no markdown fences.',
          },
          { role: 'user', content: input.prompt },
        ],
        max_output_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI exam generation failed with status ${response.status}: ${errorText}`,
      );
    }

    const payload = (await response.json()) as OpenAIResponsePayload;
    const text = this.extractOutputText(payload);
    const parsed = this.parseJson(text);
    const questions = Array.isArray(parsed.questions)
      ? (parsed.questions as GeneratedQuestion[])
      : [];

    return {
      questions,
      modelName: model,
      provider: 'openai',
      tokensUsed: payload.usage?.total_tokens ?? 0,
    };
  }

  private extractOutputText(payload: OpenAIResponsePayload): string {
    if (payload.output_text) {
      return payload.output_text;
    }
    return (
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .filter((text): text is string => Boolean(text))
        .join('\n')
        .trim() ?? ''
    );
  }

  private parseJson(text: string): ExamGenerationJson {
    try {
      return JSON.parse(text) as ExamGenerationJson;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return {};
      }
      try {
        return JSON.parse(match[0]) as ExamGenerationJson;
      } catch {
        return {};
      }
    }
  }
}
