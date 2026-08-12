import { ConfigService } from '@nestjs/config';
import { OpenAILlmProvider } from './llm.adapter';

describe('OpenAILlmProvider', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('calls the Responses API and keeps only citations from retrieved chunks', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          answer: 'الإجابة من المادة فقط.',
          citedChunkIds: ['chunk-1', 'invented'],
        }),
        usage: { total_tokens: 42 },
      }),
    });
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'valid-key';
        if (key === 'LLM_MODEL') return 'gpt-test';
        return undefined;
      }),
    } as unknown as ConfigService;

    const provider = new OpenAILlmProvider(configService);

    const result = await provider.generateAnswer({
      prompt: 'Use chunk_id=chunk-1 only.',
      question: 'اشرح',
      chunks: [
        {
          chunkId: 'chunk-1',
          vectorId: 'vector-1',
          documentId: 'doc-1',
          page: 1,
          excerpt: 'نص من المادة.',
          score: 0.1,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-key',
        }),
      }),
    );
    expect(result).toEqual({
      answer: 'الإجابة من المادة فقط.',
      citedChunkIds: ['chunk-1'],
      modelName: 'gpt-test',
      provider: 'openai',
      tokensUsed: 42,
    });
  });

  it('requests Structured Outputs via text.format json_schema with strict true', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        output_text: JSON.stringify({
          answer: 'الإجابة.',
          citedChunkIds: ['chunk-1'],
        }),
        usage: { total_tokens: 10 },
      }),
    });
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'valid-key';
        if (key === 'LLM_MODEL') return 'gpt-test';
        return undefined;
      }),
    } as unknown as ConfigService;

    const provider = new OpenAILlmProvider(configService);

    await provider.generateAnswer({
      prompt: 'Use chunk_id=chunk-1 only.',
      question: 'اشرح',
      chunks: [
        {
          chunkId: 'chunk-1',
          vectorId: 'vector-1',
          documentId: 'doc-1',
          page: 1,
          excerpt: 'نص من المادة.',
          score: 0.1,
        },
      ],
    });

    const init = (
      fetchMock.mock.calls[0] as Array<string | RequestInit | undefined>
    )[1] as RequestInit | undefined;
    const body = JSON.parse((init?.body as string) ?? '{}') as {
      text?: {
        format?: { type?: string; name?: string; strict?: boolean };
      };
    };
    expect(body.text?.format?.type).toBe('json_schema');
    expect(body.text?.format?.name).toBe('grounded_tutor_answer');
    expect(body.text?.format?.strict).toBe(true);
    expect(JSON.stringify(body)).toContain('"type":"json_schema"');
    expect(JSON.stringify(body)).toContain('"strict":true');
  });

  it('throws when the model returns a refusal instead of the schema', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        output: [{ type: 'refusal', content: [] }],
        usage: { total_tokens: 5 },
      }),
    });
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'valid-key';
        if (key === 'LLM_MODEL') return 'gpt-test';
        return undefined;
      }),
    } as unknown as ConfigService;

    const provider = new OpenAILlmProvider(configService);

    await expect(
      provider.generateAnswer({
        prompt: 'Use chunk_id=chunk-1 only.',
        question: 'اشرح',
        chunks: [
          {
            chunkId: 'chunk-1',
            vectorId: 'vector-1',
            documentId: 'doc-1',
            page: 1,
            excerpt: 'نص من المادة.',
            score: 0.1,
          },
        ],
      }),
    ).rejects.toThrow(/refusal/i);
  });
});
