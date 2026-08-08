import { ConfigService } from '@nestjs/config';
import type {
  RetrievedChunk,
  RetrievedVideoChunk,
} from '../../../common/ports/retrieval.port';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmGenerateInput {
  prompt: string;
  question: string;
  // Course-document chunks (Tutor) or video-transcript chunks (Video Q&A) —
  // only `chunkId`/`excerpt` are used here, but the full union is kept so
  // callers don't need to reshape either retrieval result.
  chunks: RetrievedChunk[] | RetrievedVideoChunk[];
}

export interface LlmGenerateResult {
  answer: string;
  citedChunkIds: string[];
  modelName: string;
  provider: string;
  tokensUsed: number;
}

export interface LlmProvider {
  generateAnswer(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}

export class MockLlmProvider implements LlmProvider {
  async generateAnswer(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const firstChunk = input.chunks[0];
    return {
      answer: `حسب المادة المرفوعة: ${firstChunk.excerpt}`,
      citedChunkIds: firstChunk ? [firstChunk.chunkId] : [],
      modelName: 'mock-courseflix-tutor',
      provider: 'mock',
      tokensUsed: Math.max(1, Math.ceil(input.prompt.length / 4)),
    };
  }
}

interface OpenAIResponsePayload {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface GroundedTutorJson {
  answer?: unknown;
  citedChunkIds?: unknown;
}

export class OpenAILlmProvider implements LlmProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateAnswer(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const apiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('LLM_API_KEY') ||
      this.configService.get<string>('EMBEDDING_API_KEY');
    const model =
      this.configService.get<string>('LLM_MODEL') ||
      this.configService.get<string>('OPENAI_MODEL') ||
      'gpt-5.6';

    if (!apiKey || apiKey === 'replace-me') {
      throw new Error(
        'OPENAI_API_KEY is not configured. Set a valid API key or use MockLlmProvider.',
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
              'Return only compact JSON with keys answer and citedChunkIds. citedChunkIds must contain only chunk_id values provided in the prompt.',
          },
          {
            role: 'user',
            content: `${input.prompt}

Return JSON in this exact shape:
{"answer":"Arabic answer grounded only in the material","citedChunkIds":["chunk-id"]}`,
          },
        ],
        max_output_tokens: 700,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI tutor failed with status ${response.status}: ${errorText}`,
      );
    }

    const payload = (await response.json()) as OpenAIResponsePayload;
    const text = this.extractOutputText(payload);
    const parsed = this.parseJson(text);
    const allowedChunkIds = new Set(input.chunks.map((chunk) => chunk.chunkId));
    const citedChunkIds = Array.isArray(parsed.citedChunkIds)
      ? parsed.citedChunkIds.filter(
          (chunkId): chunkId is string =>
            typeof chunkId === 'string' && allowedChunkIds.has(chunkId),
        )
      : [];

    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : text,
      citedChunkIds,
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

  private parseJson(text: string): GroundedTutorJson {
    try {
      return JSON.parse(text) as GroundedTutorJson;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return {};
      }
      return JSON.parse(match[0]) as GroundedTutorJson;
    }
  }
}
