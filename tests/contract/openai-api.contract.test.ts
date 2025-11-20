/**
 * Contract Tests for OpenAI API
 *
 * Verifies that our code correctly handles OpenAI API responses.
 * Tests chat completions, streaming, and error scenarios.
 */

import { Pact } from '@pact-foundation/pact';
import path from 'path';

class OpenAIClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  async createChatCompletion(request: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message}`);
    }

    return response.json();
  }

  async *createChatCompletionStream(request: any): AsyncGenerator<any> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            yield JSON.parse(data);
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

describe('OpenAI API Contract Tests', () => {
  const provider = new Pact({
    consumer: 'AI-SaaS-Platform',
    provider: 'OpenAI-API',
    port: 8990,
    log: path.resolve(process.cwd(), 'logs', 'pact.log'),
    dir: path.resolve(process.cwd(), 'pacts'),
    logLevel: 'info',
  });

  let openaiClient: OpenAIClient;

  beforeAll(async () => {
    await provider.setup();
    openaiClient = new OpenAIClient('http://localhost:8990', 'test_key');
  });

  afterAll(async () => {
    await provider.finalize();
  });

  afterEach(async () => {
    await provider.verify();
  });

  describe('Chat Completions', () => {
    it('should create chat completion successfully', async () => {
      await provider.addInteraction({
        state: 'valid API key and model',
        uponReceiving: 'a request for chat completion',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [
              { role: 'user', content: 'Hello, how are you?' },
            ],
            max_tokens: 100,
            temperature: 0.7,
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'chatcmpl-test123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: "I'm doing well, thank you! How can I help you today?",
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 15,
              total_tokens: 27,
            },
          },
        },
      });

      const response = await openaiClient.createChatCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        max_tokens: 100,
        temperature: 0.7,
      });

      expect(response.id).toBe('chatcmpl-test123');
      expect(response.model).toBe('gpt-4');
      expect(response.choices[0].message.content).toContain('doing well');
      expect(response.usage.total_tokens).toBe(27);
    });

    it('should handle rate limit error', async () => {
      await provider.addInteraction({
        state: 'rate limit exceeded',
        uponReceiving: 'a request when rate limited',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          },
        },
        willRespondWith: {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
          body: {
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
              param: null,
              code: 'rate_limit_exceeded',
            },
          },
        },
      });

      await expect(
        openaiClient.createChatCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow(/rate limit exceeded/i);
    });

    it('should handle invalid model error', async () => {
      await provider.addInteraction({
        state: 'invalid model specified',
        uponReceiving: 'a request with invalid model',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'invalid-model',
            messages: [{ role: 'user', content: 'Test' }],
          },
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: {
              message: 'The model `invalid-model` does not exist',
              type: 'invalid_request_error',
              param: 'model',
              code: 'model_not_found',
            },
          },
        },
      });

      await expect(
        openaiClient.createChatCompletion({
          model: 'invalid-model',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow(/model.*not exist/i);
    });

    it('should handle context length exceeded error', async () => {
      await provider.addInteraction({
        state: 'context length exceeded',
        uponReceiving: 'a request with too many tokens',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'A'.repeat(100000) }],
          },
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: {
              message: "This model's maximum context length is 8192 tokens",
              type: 'invalid_request_error',
              param: 'messages',
              code: 'context_length_exceeded',
            },
          },
        },
      });

      await expect(
        openaiClient.createChatCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'A'.repeat(100000) }],
        })
      ).rejects.toThrow(/context length/i);
    });
  });

  describe('Function Calling', () => {
    it('should handle function calling response', async () => {
      await provider.addInteraction({
        state: 'function calling enabled',
        uponReceiving: 'a request with function definitions',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [
              { role: 'user', content: 'What is the weather in Boston?' },
            ],
            functions: [
              {
                name: 'get_weather',
                description: 'Get the current weather',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            ],
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'chatcmpl-test456',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  function_call: {
                    name: 'get_weather',
                    arguments: '{"location": "Boston"}',
                  },
                },
                finish_reason: 'function_call',
              },
            ],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 10,
              total_tokens: 60,
            },
          },
        },
      });

      const response = await openaiClient.createChatCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What is the weather in Boston?' },
        ],
        functions: [
          {
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        ],
      });

      expect(response.choices[0].finish_reason).toBe('function_call');
      expect(response.choices[0].message.function_call.name).toBe('get_weather');
      expect(response.choices[0].message.function_call.arguments).toContain('Boston');
    });
  });

  describe('Different Models', () => {
    it('should work with GPT-3.5 Turbo', async () => {
      await provider.addInteraction({
        state: 'GPT-3.5 available',
        uponReceiving: 'a request for GPT-3.5',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hi' }],
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'chatcmpl-gpt35',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-3.5-turbo',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello! How can I help you?',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 10,
              total_tokens: 18,
            },
          },
        },
      });

      const response = await openaiClient.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.model).toBe('gpt-3.5-turbo');
      expect(response.usage.total_tokens).toBe(18);
    });
  });

  describe('Authentication', () => {
    it('should handle invalid API key', async () => {
      await provider.addInteraction({
        state: 'invalid API key',
        uponReceiving: 'a request with invalid key',
        withRequest: {
          method: 'POST',
          path: '/v1/chat/completions',
          headers: {
            'Authorization': 'Bearer invalid_key',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          },
        },
        willRespondWith: {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: {
              message: 'Incorrect API key provided',
              type: 'invalid_request_error',
              param: null,
              code: 'invalid_api_key',
            },
          },
        },
      });

      const invalidClient = new OpenAIClient('http://localhost:8990', 'invalid_key');

      await expect(
        invalidClient.createChatCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        })
      ).rejects.toThrow(/incorrect api key/i);
    });
  });
});
