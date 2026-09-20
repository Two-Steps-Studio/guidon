import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * MCPClient manages the connection to an external MCP server.
 * In Guidon, this is used to execute tools provided by MCP servers
 * (e.g., a filesystem server, a github server, or Guidon's own internal server).
 */
export class MCPClient {
  private client: Client | null = null;

  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Connect to an MCP server using stdio transport.
   * @param command The command to launch the server (e.g., 'npx', 'node').
   * @param args Arguments for the command.
   */
  async connect(command: string, args: string[]): Promise<void> {
    if (this.client) return;

    const transport = new StdioClientTransport({
      command,
      args,
    });

    this.client = new Client(
      {
        name: "guidon-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  /**
   * Call a tool on the connected MCP server.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.client) {
      throw new Error("MCP Client is not connected. Call connect() first.");
    }
    return await this.client.callTool({
      name,
      arguments: args,
    });
  }

  /**
   * Read a resource from the connected MCP server.
   */
  async readResource(uri: string): Promise<any> {
    if (!this.client) {
      throw new Error("MCP Client is not connected. Call connect() first.");
    }
    return await this.client.readResource({ uri });
  }

  /**
   * List available tools on the connected MCP server.
   */
  async listTools(): Promise<any> {
    if (!this.client) {
      throw new Error("MCP Client is not connected. Call connect() first.");
    }
    return await this.client.listTools();
  }
}

export const mcpClient = new MCPClient();
