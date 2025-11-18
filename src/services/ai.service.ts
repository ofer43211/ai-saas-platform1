import {
  AIProvider,
  AIModel,
  AICompletionRequest,
  AICompletionResponse,
  AIStreamChunk,
  AIProviderConfig,
  AIMessage,
} from '../types/ai.types';

export class AIServiceError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public provider?: AIProvider
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class RateLimitError extends AIServiceError {
  constructor(provider: AIProvider, retryAfter?: number) {
    super(`Rate limit exceeded for ${provider}`, 429, provider);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
  retryAfter?: number;
}

export interface IAIClient {
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  stream(request: AICompletionRequest): AsyncGenerator<AIStreamChunk>;
}

export class AIService {
  private readonly DEFAULT_MAX_TOKENS = 2048;
  private readonly DEFAULT_TEMPERATURE = 0.7;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    private client: IAIClient,
    private config: AIProviderConfig
  ) {}

  /**
   * Generate a completion from the AI model
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    this.validateRequest(request);

    const normalizedRequest: AICompletionRequest = {
      ...request,
      maxTokens: request.maxTokens || this.DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? this.DEFAULT_TEMPERATURE,
      stream: false,
    };

    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries ?? this.MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeWithTimeout(
          () => this.client.complete(normalizedRequest),
          this.config.timeout || this.DEFAULT_TIMEOUT
        );

        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on rate limit errors
        if (error instanceof RateLimitError) {
          throw error;
        }

        // Don't retry on validation errors
        if (error instanceof AIServiceError && error.statusCode === 400) {
          throw error;
        }

        // If this was the last attempt, throw
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        await this.delay(this.RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }

    throw new AIServiceError(
      `Failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      500
    );
  }

  /**
   * Stream a completion from the AI model
   */
  async *stream(request: AICompletionRequest): AsyncGenerator<AIStreamChunk> {
    this.validateRequest(request);

    const normalizedRequest: AICompletionRequest = {
      ...request,
      maxTokens: request.maxTokens || this.DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? this.DEFAULT_TEMPERATURE,
      stream: true,
    };

    try {
      for await (const chunk of this.client.stream(normalizedRequest)) {
        yield chunk;
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      throw new AIServiceError(
        `Streaming failed: ${(error as Error).message}`,
        500
      );
    }
  }

  /**
   * Count tokens in a message (approximate)
   */
  countTokens(text: string, model: AIModel): number {
    // Simple approximation: ~4 characters per token
    // In production, use a proper tokenizer like tiktoken
    const baseTokens = Math.ceil(text.length / 4);

    // Different models have different token counting
    const modelMultiplier = this.getModelTokenMultiplier(model);

    return Math.ceil(baseTokens * modelMultiplier);
  }

  /**
   * Build a prompt from messages
   */
  buildPrompt(messages: AIMessage[]): string {
    return messages
      .map(msg => {
        const role = msg.role.toUpperCase();
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Validate AI request
   */
  private validateRequest(request: AICompletionRequest): void {
    if (!request.model) {
      throw new AIServiceError('Model is required', 400);
    }

    if (!request.messages || request.messages.length === 0) {
      throw new AIServiceError('Messages array cannot be empty', 400);
    }

    // Validate each message
    for (const message of request.messages) {
      if (!message.role || !message.content) {
        throw new AIServiceError('Each message must have role and content', 400);
      }

      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new AIServiceError(
          'Message role must be system, user, or assistant',
          400
        );
      }
    }

    if (request.maxTokens !== undefined && request.maxTokens <= 0) {
      throw new AIServiceError('maxTokens must be positive', 400);
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw new AIServiceError('temperature must be between 0 and 2', 400);
      }
    }

    if (request.topP !== undefined) {
      if (request.topP < 0 || request.topP > 1) {
        throw new AIServiceError('topP must be between 0 and 1', 400);
      }
    }

    // Check total token count
    const totalPromptText = this.buildPrompt(request.messages);
    const estimatedTokens = this.countTokens(totalPromptText, request.model);
    const maxContextTokens = this.getModelMaxTokens(request.model);

    if (estimatedTokens > maxContextTokens) {
      throw new AIServiceError(
        `Estimated tokens (${estimatedTokens}) exceeds model limit (${maxContextTokens})`,
        400
      );
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new AIServiceError('Request timeout', 408)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get model-specific token multiplier
   */
  private getModelTokenMultiplier(model: AIModel): number {
    // These are approximations
    const multipliers: Record<string, number> = {
      [AIModel.GPT_4]: 1.0,
      [AIModel.GPT_4_TURBO]: 1.0,
      [AIModel.GPT_3_5_TURBO]: 1.0,
      [AIModel.CLAUDE_3_OPUS]: 1.1,
      [AIModel.CLAUDE_3_SONNET]: 1.1,
      [AIModel.CLAUDE_3_HAIKU]: 1.1,
    };

    return multipliers[model] || 1.0;
  }

  /**
   * Get model maximum context tokens
   */
  private getModelMaxTokens(model: AIModel): number {
    const limits: Record<string, number> = {
      [AIModel.GPT_4]: 8192,
      [AIModel.GPT_4_TURBO]: 128000,
      [AIModel.GPT_3_5_TURBO]: 16384,
      [AIModel.CLAUDE_3_OPUS]: 200000,
      [AIModel.CLAUDE_3_SONNET]: 200000,
      [AIModel.CLAUDE_3_HAIKU]: 200000,
    };

    return limits[model] || 8192;
  }
}
