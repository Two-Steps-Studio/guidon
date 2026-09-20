import "server-only";

import { getAIProvider, type AICompletionInput, type AIMessage } from "./provider";
import { mcpClient } from "@/lib/mcp/client";

/**
 * AIOrchestrator handles the multi-turn loop between the LLM and MCP tools.
 */
export class AIOrchestrator {
  /**
   * Runs a completion request to completion, executing any tool calls requested by the LLM.
   */
  async run(input: AICompletionInput, userId?: string): Promise<string> {
    // Automatyczne połączenie z serwerem MCP, jeśli nie jest połączony
    if (!mcpClient.isConnected()) {
      await mcpClient.connect("node", ["src/lib/mcp/server.ts"]);
    }

    let currentMessages = [...input.messages];
    let systemPrompt = input.system;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      const provider = await getAIProvider();
      const result = await provider.complete({
        system: systemPrompt,
        messages: currentMessages,
        tools: await this.getAvailableTools(),
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });

      if (!result.tool_calls || result.tool_calls.length === 0) {
        return result.text;
      }

      // Handle tool calls
      const toolResponses: AIMessage[] = [];
      for (const toolCall of result.tool_calls) {
        try {
          // Przekazujemy userId do mcpClient, aby serwer mógł zastosować RLS
          const toolResult = await mcpClient.callTool(toolCall.name, {
            ...toolCall.args,
            userId,
          });
          toolResponses.push({
            role: "tool",
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });
        } catch (error: any) {
          toolResponses.push({
            role: "tool",
            content: `Error executing tool ${toolCall.name}: ${error.message}`,
            tool_call_id: toolCall.id,
          });
        }
      }

      // Add assistant's tool call and tool results to history
      currentMessages.push({
        role: "assistant",
        content: result.text,
        tool_calls: result.tool_calls,
      });
      currentMessages.push(...toolResponses);

      iterations++;
    }

    throw new Error("AIOrchestrator: Maximum tool-call iterations reached.");
  }

  private async getAvailableTools(): Promise<any[]> {
    try {
      const tools = await mcpClient.listTools();
      return tools.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    } catch {
      return [];
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
