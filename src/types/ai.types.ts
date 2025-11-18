export enum AIProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  COHERE = 'cohere',
}

export enum AIModel {
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  CLAUDE_3_OPUS = 'claude-3-opus-20240229',
  CLAUDE_3_SONNET = 'claude-3-sonnet-20240229',
  CLAUDE_3_HAIKU = 'claude-3-haiku-20240307',
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  model: AIModel;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  id: string;
  model: string;
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: Date;
}

export interface AIStreamChunk {
  id: string;
  delta: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
}

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface TokenCount {
  tokens: number;
  model: AIModel;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  model: AIModel;
  systemPrompt?: string;
}
