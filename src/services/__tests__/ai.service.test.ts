import { AIService, AIServiceError, RateLimitError, IAIClient } from '../ai.service';
import {
  AIModel,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  AIProviderConfig,
  AIProvider,
} from '../../types/ai.types';

// Mock AI Client
class MockAIClient implements IAIClient {
  public shouldFail = false;
  public failCount = 0;
  public callCount = 0;
  public lastRequest?: AICompletionRequest;

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    this.callCount++;
    this.lastRequest = request;

    if (this.shouldFail && this.callCount <= this.failCount) {
      throw new Error('Mock API error');
    }

    return {
      id: 'mock-completion-id',
      model: request.model,
      content: 'This is a mock AI response',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      },
      createdAt: new Date(),
    };
  }

  async *stream(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
    this.callCount++;
    this.lastRequest = request;

    if (this.shouldFail) {
      throw new Error('Mock streaming error');
    }

    const chunks = ['Hello', ' ', 'world', '!'];
    for (const delta of chunks) {
      yield {
        id: 'mock-stream-id',
        delta,
      };
    }

    yield {
      id: 'mock-stream-id',
      delta: '',
      finishReason: 'stop',
    };
  }

  reset() {
    this.shouldFail = false;
    this.failCount = 0;
    this.callCount = 0;
    this.lastRequest = undefined;
  }
}

describe('AIService', () => {
  let aiService: AIService;
  let mockClient: MockAIClient;
  let config: AIProviderConfig;

  beforeEach(() => {
    mockClient = new MockAIClient();
    config = {
      apiKey: 'test-api-key',
      timeout: 5000,
      maxRetries: 2,
    };
    aiService = new AIService(mockClient, config);
  });

  describe('complete', () => {
    const validRequest: AICompletionRequest = {
      model: AIModel.GPT_4,
      messages: [
        { role: 'user', content: 'Hello, AI!' },
      ],
    };

    it('should successfully complete a request', async () => {
      const response = await aiService.complete(validRequest);

      expect(response).toBeDefined();
      expect(response.id).toBe('mock-completion-id');
      expect(response.model).toBe(AIModel.GPT_4);
      expect(response.content).toBe('This is a mock AI response');
      expect(response.finishReason).toBe('stop');
      expect(response.usage.totalTokens).toBe(18);
    });

    it('should set default maxTokens if not provided', async () => {
      await aiService.complete(validRequest);

      expect(mockClient.lastRequest?.maxTokens).toBe(2048);
    });

    it('should set default temperature if not provided', async () => {
      await aiService.complete(validRequest);

      expect(mockClient.lastRequest?.temperature).toBe(0.7);
    });

    it('should respect custom maxTokens and temperature', async () => {
      await aiService.complete({
        ...validRequest,
        maxTokens: 500,
        temperature: 0.5,
      });

      expect(mockClient.lastRequest?.maxTokens).toBe(500);
      expect(mockClient.lastRequest?.temperature).toBe(0.5);
    });

    it('should set stream to false for completion', async () => {
      await aiService.complete(validRequest);

      expect(mockClient.lastRequest?.stream).toBe(false);
    });

    it('should retry on transient failures', async () => {
      mockClient.shouldFail = true;
      mockClient.failCount = 1; // Fail once, then succeed

      const response = await aiService.complete(validRequest);

      expect(response).toBeDefined();
      expect(mockClient.callCount).toBe(2); // Initial + 1 retry
    });

    it('should throw after max retries exceeded', async () => {
      mockClient.shouldFail = true;
      mockClient.failCount = 10; // Keep failing

      await expect(aiService.complete(validRequest)).rejects.toThrow(AIServiceError);
      expect(mockClient.callCount).toBe(3); // Initial + 2 retries
    });

    it('should handle system messages', async () => {
      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await aiService.complete(request);

      expect(mockClient.lastRequest?.messages).toHaveLength(2);
      expect(mockClient.lastRequest?.messages[0].role).toBe('system');
    });

    it('should handle multiple message exchanges', async () => {
      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      await aiService.complete(request);

      expect(mockClient.lastRequest?.messages).toHaveLength(3);
    });
  });

  describe('stream', () => {
    const validRequest: AICompletionRequest = {
      model: AIModel.GPT_4,
      messages: [
        { role: 'user', content: 'Hello, AI!' },
      ],
    };

    it('should stream response chunks', async () => {
      const chunks: AIStreamChunk[] = [];

      for await (const chunk of aiService.stream(validRequest)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(5);
      expect(chunks[0].delta).toBe('Hello');
      expect(chunks[1].delta).toBe(' ');
      expect(chunks[2].delta).toBe('world');
      expect(chunks[3].delta).toBe('!');
      expect(chunks[4].finishReason).toBe('stop');
    });

    it('should set stream to true for streaming', async () => {
      const generator = aiService.stream(validRequest);
      await generator.next();

      expect(mockClient.lastRequest?.stream).toBe(true);
    });

    it('should throw AIServiceError on streaming failure', async () => {
      mockClient.shouldFail = true;

      const generator = aiService.stream(validRequest);

      await expect(generator.next()).rejects.toThrow(AIServiceError);
    });

    it('should allow iterating through all chunks', async () => {
      let totalDelta = '';

      for await (const chunk of aiService.stream(validRequest)) {
        totalDelta += chunk.delta;
      }

      expect(totalDelta).toBe('Hello world!');
    });
  });

  describe('Validation', () => {
    it('should throw error for missing model', async () => {
      const invalidRequest = {
        messages: [{ role: 'user' as const, content: 'Hello' }],
      } as AICompletionRequest;

      await expect(aiService.complete(invalidRequest)).rejects.toThrow('Model is required');
    });

    it('should throw error for empty messages array', async () => {
      const invalidRequest: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [],
      };

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'Messages array cannot be empty'
      );
    });

    it('should throw error for message without role', async () => {
      const invalidRequest = {
        model: AIModel.GPT_4,
        messages: [{ content: 'Hello' }],
      } as any;

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'Each message must have role and content'
      );
    });

    it('should throw error for message without content', async () => {
      const invalidRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user' }],
      } as any;

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'Each message must have role and content'
      );
    });

    it('should throw error for invalid role', async () => {
      const invalidRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'invalid', content: 'Hello' }],
      } as any;

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'Message role must be system, user, or assistant'
      );
    });

    it('should throw error for negative maxTokens', async () => {
      const invalidRequest: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: -100,
      };

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'maxTokens must be positive'
      );
    });

    it('should throw error for invalid temperature', async () => {
      const invalidRequest: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3.0,
      };

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'temperature must be between 0 and 2'
      );
    });

    it('should throw error for invalid topP', async () => {
      const invalidRequest: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
        topP: 1.5,
      };

      await expect(aiService.complete(invalidRequest)).rejects.toThrow(
        'topP must be between 0 and 1'
      );
    });

    it('should accept valid temperature range', async () => {
      await expect(
        aiService.complete({
          model: AIModel.GPT_4,
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 0,
        })
      ).resolves.toBeDefined();

      await expect(
        aiService.complete({
          model: AIModel.GPT_4,
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 1.0,
        })
      ).resolves.toBeDefined();
    });

    it('should accept valid topP range', async () => {
      await expect(
        aiService.complete({
          model: AIModel.GPT_4,
          messages: [{ role: 'user', content: 'Hello' }],
          topP: 0.5,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('countTokens', () => {
    it('should approximate token count for text', () => {
      const text = 'Hello, world!'; // ~3-4 tokens
      const count = aiService.countTokens(text, AIModel.GPT_4);

      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it('should return higher count for longer text', () => {
      const shortText = 'Hi';
      const longText = 'This is a much longer text that contains many more words and characters.';

      const shortCount = aiService.countTokens(shortText, AIModel.GPT_4);
      const longCount = aiService.countTokens(longText, AIModel.GPT_4);

      expect(longCount).toBeGreaterThan(shortCount);
    });

    it('should handle different models', () => {
      const text = 'Sample text for token counting';

      const gpt4Count = aiService.countTokens(text, AIModel.GPT_4);
      const claudeCount = aiService.countTokens(text, AIModel.CLAUDE_3_OPUS);

      expect(gpt4Count).toBeGreaterThan(0);
      expect(claudeCount).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const count = aiService.countTokens('', AIModel.GPT_4);

      expect(count).toBe(0);
    });
  });

  describe('buildPrompt', () => {
    it('should build formatted prompt from messages', () => {
      const messages = [
        { role: 'system' as const, content: 'You are helpful' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      const prompt = aiService.buildPrompt(messages);

      expect(prompt).toContain('SYSTEM: You are helpful');
      expect(prompt).toContain('USER: Hello');
      expect(prompt).toContain('ASSISTANT: Hi there!');
    });

    it('should separate messages with double newline', () => {
      const messages = [
        { role: 'user' as const, content: 'First' },
        { role: 'assistant' as const, content: 'Second' },
      ];

      const prompt = aiService.buildPrompt(messages);

      expect(prompt).toContain('\n\n');
    });

    it('should handle single message', () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const prompt = aiService.buildPrompt(messages);

      expect(prompt).toBe('USER: Hello');
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages', async () => {
      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [],
      };

      try {
        await aiService.complete(request);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AIServiceError);
        expect((error as AIServiceError).message).toContain('cannot be empty');
      }
    });

    it('should include status code in error', async () => {
      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [],
      };

      try {
        await aiService.complete(request);
      } catch (error) {
        expect((error as AIServiceError).statusCode).toBe(400);
      }
    });
  });

  describe('Rate Limiting', () => {
    class RateLimitMockClient implements IAIClient {
      async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
        throw new RateLimitError(AIProvider.OPENAI, 60);
      }

      async *stream(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
        throw new RateLimitError(AIProvider.OPENAI, 60);
      }
    }

    it('should not retry on rate limit errors', async () => {
      const rateLimitClient = new RateLimitMockClient();
      const service = new AIService(rateLimitClient, config);

      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(service.complete(request)).rejects.toThrow(RateLimitError);
    });

    it('should include retry information in rate limit error', async () => {
      const rateLimitClient = new RateLimitMockClient();
      const service = new AIService(rateLimitClient, config);

      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      try {
        await service.complete(request);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBe(60);
      }
    });
  });

  describe('Timeout Handling', () => {
    class SlowMockClient implements IAIClient {
      async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        return {
          id: 'slow-id',
          model: request.model,
          content: 'Slow response',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          createdAt: new Date(),
        };
      }

      async *stream(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
        yield { id: 'slow-id', delta: 'test' };
      }
    }

    it('should timeout long-running requests', async () => {
      const slowClient = new SlowMockClient();
      const fastTimeoutConfig = { ...config, timeout: 100 };
      const service = new AIService(slowClient, fastTimeoutConfig);

      const request: AICompletionRequest = {
        model: AIModel.GPT_4,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(service.complete(request)).rejects.toThrow('Request timeout');
    }, 10000);
  });
});
