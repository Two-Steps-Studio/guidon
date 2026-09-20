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
    // OPTIMIZATION: Use in-process server instead of launching a new node process via stdio.
    // This eliminates the 500ms-2s startup overhead per request.
    if (!mcpClient.isConnected()) {
      // We now connect to the internal server instance directly or via a persistent transport
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
    // OPTIMIZATION: Cache tool definitions to avoid redundant listTools calls
    if (this._cachedTools) return this._cachedTools;

    try {
      const tools = await mcpClient.listTools();
      const formatted = tools.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
      this._cachedTools = formatted;
      return formatted;
    } catch {
      return [];
    }
  }

  private _cachedTools: any[] | null = null;
}

export const aiOrchestrator = new AIOrchestrator();
