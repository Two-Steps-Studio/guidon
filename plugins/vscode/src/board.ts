import * as vscode from "vscode";
import { BoardStore } from "./store";

/** Messages the webview posts (media/board.js). */
type WebviewMessage =
  | { type: "ready" | "logout" | "refresh" | "openBrowser" | "dismissError" }
  | { type: "login"; baseUrl: string }
  | { type: "selectProject" | "select" | "copyRef" | "startBranch" | "delete"; id: string }
  | { type: "move"; id: string; status: string }
  | { type: "create"; title: string; status?: string; parentId?: string }
  | { type: "save"; id: string; fields: { title: string; description: string; priority: string; due_date: string } }
  | { type: "comment"; id: string; content: string };

export interface BoardCommands {
  login(baseUrl?: string): Promise<void>;
  logout(): Promise<void>;
  openBrowser(): void;
  copyRef(taskId: string): Promise<void>;
  startBranch(taskId: string): Promise<void>;
  confirmDelete(title: string): Promise<boolean>;
}

/** The board as a webview panel (one per window). */
export class BoardPanel {
  private static current: BoardPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext, store: BoardStore, commands: BoardCommands): void {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("guidon.board", "Guidon", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    BoardPanel.current = new BoardPanel(panel, context, store, commands);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly store: BoardStore,
    private readonly commands: BoardCommands
  ) {
    panel.webview.html = BoardPanel.html(panel.webview, context.extensionUri);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.handle(message)),
      { dispose: store.onChange(() => this.post()) },
      panel.onDidDispose(() => this.dispose())
    );
  }

  private post(): void {
    void this.panel.webview.postMessage({ type: "state", state: this.store.state() });
  }

  private async handle(message: WebviewMessage): Promise<void> {
    const store = this.store;
    switch (message.type) {
      case "ready":
        this.post();
        if (store.state().loggedIn && store.projects.length === 0) await store.refresh();
        return;
      case "login":
        return this.commands.login(message.baseUrl);
      case "logout":
        return this.commands.logout();
      case "refresh":
        return store.refresh();
      case "openBrowser":
        return this.commands.openBrowser();
      case "dismissError":
        return store.setError("");
      case "selectProject":
        return store.selectProject(message.id);
      case "select":
        return store.select(message.id);
      case "move":
        await store.move(message.id, message.status);
        return;
      case "create":
        await store.create(message.title, message.status ?? "", message.parentId ?? "");
        return;
      case "save":
        await store.save(message.id, message.fields);
        return;
      case "delete": {
        const task = store.findTask(message.id);
        if (task && (await this.commands.confirmDelete(task.title))) await store.remove(message.id);
        return;
      }
      case "comment":
        await store.comment(message.id, message.content);
        return;
      case "copyRef":
        return this.commands.copyRef(message.id);
      case "startBranch":
        return this.commands.startBranch(message.id);
    }
  }

  private static html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", file));
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    // Strict CSP: only this extension's own script/style; the webview never talks to the network itself.
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media("board.css")}"><title>Guidon</title></head>
<body><div id="app"></div><script nonce="${nonce}" src="${media("board.js")}"></script></body></html>`;
  }

  private dispose(): void {
    BoardPanel.current = undefined;
    for (const disposable of this.disposables) disposable.dispose();
  }
}
