import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ContentBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { AIClient, AIMessage, AIResponse, AIProvider, MCPToolDefinition, ToolCall, ToolExecutor } from './types';
import { getStageConfig } from './config';
import { estimateTokens } from './ContextManager';

// Anthropic client implementation with tool support
class AnthropicClient implements AIClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async chat(messages: AIMessage[], tools?: MCPToolDefinition[], toolExecutor?: ToolExecutor): Promise<AIResponse> {
    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages: MessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    // Convert MCP tools to Anthropic format
    const anthropicTools = tools?.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
    }));

    let allContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const toolCalls: ToolCall[] = [];
    let currentMessages: MessageParam[] = [...conversationMessages];

    // Loop for tool use
    let maxIterations = 10;
    while (maxIterations > 0) {
      maxIterations--;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemMessage?.content || '',
        messages: currentMessages,
        ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {})
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Process response content
      let hasToolUse = false;
      const toolResults: ToolResultBlockParam[] = [];
      const assistantContent: ContentBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          allContent += block.text;
          assistantContent.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && toolExecutor) {
          hasToolUse = true;
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>
          });
          
          // Execute the tool
          const toolResult = await toolExecutor(block.name, block.input);
          
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
            result: toolResult
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult.data || toolResult.error)
          });
        }
      }

      // If no tool use, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        break;
      }

      // Add assistant message and tool results for next iteration
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: assistantContent },
        { role: 'user' as const, content: toolResults }
      ];
    }

    return {
      content: allContent,
      tokensUsed: {
        prompt: totalInputTokens,
        completion: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

// OpenAI client implementation with tool support
class OpenAIClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async chat(messages: AIMessage[], tools?: MCPToolDefinition[], toolExecutor?: ToolExecutor): Promise<AIResponse> {
    // Convert MCP tools to OpenAI format
    const openaiTools: ChatCompletionTool[] | undefined = tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>
      }
    }));

    let allContent = '';
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const toolCalls: ToolCall[] = [];
    
    let currentMessages: ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    // Helper to truncate large content
    const truncateContent = (content: string, maxChars: number = 50000): string => {
      if (content.length <= maxChars) return content;
      return content.slice(0, maxChars) + `\n\n[TRUNCATED: Content was ${content.length} chars, showing first ${maxChars}]`;
    };

    // Loop for tool use
    let maxIterations = 10;
    while (maxIterations > 0) {
      maxIterations--;

      // Debug logging - calculate actual request payload size
      const requestPayload = {
        model: this.model,
        messages: currentMessages,
        max_tokens: 4096,
        ...(openaiTools && openaiTools.length > 0 ? { tools: openaiTools } : {})
      };
      const payloadJson = JSON.stringify(requestPayload);
      const payloadSizeBytes = new TextEncoder().encode(payloadJson).length;
      const estimatedTokens = Math.ceil(payloadSizeBytes / 4);
      console.log(`[OpenAI Request] Payload size: ${payloadSizeBytes} bytes, est. ${estimatedTokens} tokens`);
      console.log(`[OpenAI Request] Messages: ${currentMessages.length}, Tools: ${openaiTools?.length || 0}`);
      if (payloadSizeBytes > 100000) {
        console.warn(`[OpenAI Request] Large payload detected! First 1000 chars of messages:`, 
          JSON.stringify(currentMessages).slice(0, 1000));
      }

      // Retry logic for rate limits
      let retryCount = 0;
      const maxRetries = 3;
      let response;
      
      while (retryCount <= maxRetries) {
        try {
          response = await this.client.chat.completions.create(requestPayload);
          break; // Success, exit retry loop
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check if it's a rate limit error
          if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
            retryCount++;
            if (retryCount <= maxRetries) {
              const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
              console.log(`[OpenAI] Rate limited, retrying in ${waitTime/1000}s (attempt ${retryCount}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          
          // For non-rate-limit errors or exhausted retries, throw with more context
          throw new Error(`OpenAI API error: ${errorMessage}. Estimated tokens in request: ${estimatedTokens}`);
        }
      }
      
      if (!response) {
        throw new Error('Failed to get response from OpenAI after retries');
      }

      const usage = response.usage;
      totalPromptTokens += usage?.prompt_tokens || 0;
      totalCompletionTokens += usage?.completion_tokens || 0;

      const choice = response.choices[0];
      const message = choice?.message;

      if (message?.content) {
        allContent += message.content;
      }

      // Check for tool calls
      if (message?.tool_calls && message.tool_calls.length > 0 && toolExecutor) {
        // Add assistant message with tool calls
        currentMessages.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls
        });

        // Execute each tool and add results
        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          
          const input = JSON.parse(toolCall.function.arguments);
          const toolResult = await toolExecutor(toolCall.function.name, input);
          
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            input,
            result: toolResult
          });

          // Truncate large tool results to prevent context explosion
          const resultContent = JSON.stringify(toolResult.data || toolResult.error);
          const truncatedResult = truncateContent(resultContent, 50000);
          
          currentMessages.push({
            role: 'tool',
            content: truncatedResult,
            tool_call_id: toolCall.id
          });
        }
      } else {
        // No more tool calls, we're done
        break;
      }
    }

    return {
      content: allContent,
      tokensUsed: {
        prompt: totalPromptTokens,
        completion: totalCompletionTokens,
        total: totalPromptTokens + totalCompletionTokens
      },
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

// Factory function to create AI client based on provider
export function createAIClient(
  provider: AIProvider,
  model: string,
  apiKey: string
): AIClient {
  switch (provider) {
    case 'anthropic':
      return new AnthropicClient(apiKey, model);
    case 'openai':
      return new OpenAIClient(apiKey, model);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// Get AI client for a specific stage
export function getAIClientForStage(stage: string): AIClient | null {
  const config = getStageConfig(stage);
  if (!config) {
    return null;
  }

  return createAIClient(config.provider, config.model, config.apiKey);
}

// Helper to build messages array for AI
export function buildMessages(
  systemPrompt: string,
  context: string,
  userPrompt?: string
): AIMessage[] {
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: context }
  ];

  if (userPrompt) {
    messages.push({ role: 'user', content: userPrompt });
  }

  return messages;
}

// Mock AI client for development/testing
export class MockAIClient implements AIClient {
  private delay: number;

  constructor(delay: number = 1000) {
    this.delay = delay;
  }

  async chat(messages: AIMessage[]): Promise<AIResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delay));

    const lastMessage = messages[messages.length - 1];
    const promptTokens = this.estimateTokens(
      messages.map((m) => m.content).join('\n')
    );

    // Generate mock response
    const response = `Mock AI response to: "${lastMessage.content.slice(0, 100)}..."`;
    const completionTokens = this.estimateTokens(response);

    return {
      content: response,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens
      }
    };
  }

  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

// Singleton map of AI clients per stage (lazily created)
const stageClients = new Map<string, AIClient>();

export function getOrCreateStageClient(stage: string): AIClient {
  let client = stageClients.get(stage);
  if (!client) {
    const stageClient = getAIClientForStage(stage);
    if (!stageClient) {
      // Fallback to mock client if no config
      client = new MockAIClient();
    } else {
      client = stageClient;
    }
    stageClients.set(stage, client);
  }
  return client;
}

// Clear cached clients (useful for config reload)
export function clearStageClients(): void {
  stageClients.clear();
}
