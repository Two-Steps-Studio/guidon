import * as vscode from "vscode";
import { GuidonApi } from "./api";
import { Reference } from "./model";

const DOWNLOAD_CONCURRENCY = 4;

type MoodboardMessage = { type: "ready" | "refresh" | "openBrowser" } | { type: "openSource"; url: string };

export interface MoodboardSource {
  api(): GuidonApi | null;
  project(): { id: string; name: string } | null;
  webUrl(projectId: string): string;
}

/**
 * The selected project's moodboard (reference images/concept art) in its own
 * webview panel. Images are downloaded here and handed to the webview as
 * data: URIs one by one, so the webview keeps a CSP with no network access.
 */
export class MoodboardPanel {
  private static current: MoodboardPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private generation = 0;
  private items: Reference[] = [];
  private projectName = "";
  private loading = false;
  private error = "";

  static show(context: vscode.ExtensionContext, source: MoodboardSource): void {
    if (MoodboardPanel.current) {
      MoodboardPanel.current.panel.reveal();
      void MoodboardPanel.current.load();
      return;
    }
    const panel = vscode.window.createWebviewPanel("guidon.moodboard", "Guidon Moodboard", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    MoodboardPanel.current = new MoodboardPanel(panel, context, source);
  }

  /** Reload if open - called when the board switches project. */
  static projectChanged(): void {
    void MoodboardPanel.current?.load();
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly source: MoodboardSource
  ) {
    panel.webview.html = MoodboardPanel.html(panel.webview, context.extensionUri);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: MoodboardMessage) => this.handle(message)),
      panel.onDidDispose(() => this.dispose())
    );
  }

  private handle(message: MoodboardMessage): void {
    switch (message.type) {
      case "ready":
      case "refresh":
        void this.load();
        return;
      case "openBrowser": {
        const project = this.source.project();
        if (project) void vscode.env.openExternal(vscode.Uri.parse(this.source.webUrl(project.id)));
        return;
      }
      case "openSource":
        if (/^https?:\/\//i.test(message.url)) void vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
    }
  }

  private post(): void {
    void this.panel.webview.postMessage({
      type: "state",
      state: {
        projectName: this.projectName,
        loading: this.loading,
        error: this.error,
        items: this.items.map(({ id, name, caption, tags, source_url }) => ({ id, name, caption, tags, source_url })),
      },
    });
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    const api = this.source.api();
    const project = this.source.project();
    this.projectName = project?.name ?? "";
    this.items = [];
    this.error = !api ? "Log in to Guidon first (Guidon: Log In)." : !project ? "Pick a project first (Guidon: Pick Project)." : "";
    this.loading = Boolean(api && project);
    this.post();
    if (!api || !project) return;

    const result = await api.listReferences(project.id);
    if (generation !== this.generation) return;
    this.loading = false;
    if (!result.ok) {
      this.error = result.error;
      this.post();
      return;
    }
    this.items = result.value;
    this.post();

    // A few at a time, newest first, each shown as soon as it arrives.
    const queue = this.items.filter((item) => item.image_url);
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const image = await api.fetchImage(item.image_url!);
        if (generation !== this.generation) return;
        void this.panel.webview.postMessage({ type: "image", id: item.id, src: image.ok ? image.value : null });
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
  }

  private static html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", file));
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    // Images arrive as data: URIs from the extension host; the webview itself never touches the network.
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media("board.css")}"><link rel="stylesheet" href="${media("moodboard.css")}"><title>Guidon Moodboard</title></head>
<body><div id="app"></div><script nonce="${nonce}" src="${media("moodboard.js")}"></script></body></html>`;
  }

  private dispose(): void {
    this.generation++;
    MoodboardPanel.current = undefined;
    for (const disposable of this.disposables) disposable.dispose();
  }
}
