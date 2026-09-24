import * as vscode from "vscode";
import { GuidonApi } from "./api";
import { BoardPanel, BoardCommands } from "./board";
import { currentRepository, gitApi } from "./git";
import { login } from "./login";
import { branchName, columnTasks, gitRef, withRef } from "./model";
import { BoardStore } from "./store";

const KEY_SECRET = "guidon.apiKey";
const EMAIL_STATE = "guidon.email";
const PROJECT_STATE = "guidon.projectId";

/**
 * Guidon Tasks for VS Code: the project board in a webview, a status-bar
 * entry, and Git helpers that tie commits and branches to tasks
 * (guidon#1a2b3c4d - see the server's GitHub integration).
 *
 * The API key lives in SecretStorage (the OS keychain), never in settings
 * or the workspace. Base URL is a normal setting; email and project are
 * global state.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let apiKey = (await context.secrets.get(KEY_SECRET)) ?? "";
  let loginCancel: { cancelled: boolean } | null = null;
  const baseUrl = () => vscode.workspace.getConfiguration("guidon").get<string>("baseUrl", "https://useguidon.com");

  const store = new BoardStore({
    api: () => (apiKey ? new GuidonApi(baseUrl(), apiKey) : null),
    getProjectId: () => context.globalState.get<string>(PROJECT_STATE, ""),
    setProjectId: (id) => void context.globalState.update(PROJECT_STATE, id),
    account: () => ({ loggedIn: apiKey !== "", email: context.globalState.get<string>(EMAIL_STATE, ""), baseUrl: baseUrl() }),
  });

  // Status bar: current project, click opens the board.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "guidon.openBoard";
  const updateStatus = () => {
    const project = store.projects.find((p) => p.id === store.projectId);
    status.text = apiKey ? `$(project) ${project?.name ?? "Guidon"}` : "$(project) Guidon: Log In";
    status.tooltip = apiKey ? "Open the Guidon board" : "Log in to Guidon";
    status.show();
  };
  updateStatus();
  context.subscriptions.push(status, { dispose: store.onChange(updateStatus) });

  const commands: BoardCommands = {
    async login(newBaseUrl) {
      if (loginCancel) return;
      if (newBaseUrl && newBaseUrl !== baseUrl()) {
        await vscode.workspace.getConfiguration("guidon").update("baseUrl", newBaseUrl.trim(), vscode.ConfigurationTarget.Global);
      }
      const cancel = { cancelled: false };
      loginCancel = cancel;
      store.loggingIn = true;
      store.setError("");
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Guidon: waiting for the browser…", cancellable: true },
        (_progress, token) => {
          token.onCancellationRequested(() => (cancel.cancelled = true));
          return login(baseUrl(), (url) => vscode.env.openExternal(vscode.Uri.parse(url)), cancel);
        }
      );
      loginCancel = null;
      store.loggingIn = false;
      if (!result.ok) return store.setError(result.error);
      apiKey = result.apiKey;
      await context.secrets.store(KEY_SECRET, apiKey);
      await context.globalState.update(EMAIL_STATE, result.email);
      await store.refresh();
    },
    async logout() {
      if (loginCancel) loginCancel.cancelled = true;
      apiKey = "";
      await context.secrets.delete(KEY_SECRET);
      await context.globalState.update(EMAIL_STATE, "");
      store.reset();
    },
    openBrowser() {
      if (store.projectId) void vscode.env.openExternal(vscode.Uri.parse(`${baseUrl().replace(/\/+$/, "")}/projects/${store.projectId}/work`));
    },
    async copyRef(taskId) {
      await vscode.env.clipboard.writeText(gitRef(taskId));
      void vscode.window.setStatusBarMessage(`Copied ${gitRef(taskId)}`, 2500);
    },
    async startBranch(taskId) {
      const task = store.findTask(taskId);
      const git = await gitApi();
      const repo = git && currentRepository(git);
      if (!task || !repo) return void vscode.window.showWarningMessage("Guidon: open a folder with a Git repository first.");
      const name = branchName(task, vscode.workspace.getConfiguration("guidon").get<string>("branchPrefix", ""));
      try {
        await repo.createBranch(name, true);
      } catch (error) {
        return void vscode.window.showErrorMessage(`Guidon: could not create branch ${name}: ${error instanceof Error ? error.message : error}`);
      }
      if (!repo.inputBox.value.toLowerCase().includes(gitRef(taskId))) repo.inputBox.value = withRef(repo.inputBox.value, taskId);
      // Starting work on it: Backlog/Todo -> In Progress (the GitHub integration would do the same on the first push).
      if (task.status === "backlog" || task.status === "todo") await store.move(taskId, "in_progress");
      void vscode.window.showInformationMessage(`Guidon: on branch ${name}`);
    },
    async confirmDelete(title) {
      const answer = await vscode.window.showWarningMessage(`Delete "${title}"? Its subtasks and comments are deleted too.`, { modal: true }, "Delete");
      return answer === "Delete";
    },
  };

  /** QuickPick over the current project's open tasks (subtasks last). */
  const pickTask = async (placeHolder: string) => {
    if (!apiKey) {
      await commands.login();
      if (!apiKey) return undefined;
    }
    if (store.projects.length === 0) await store.refresh();
    const open = store.columns
      .filter((column) => column.status !== "done")
      .flatMap((column) => columnTasks(store.tasks, column.status).map((task) => ({ task, column: column.label })));
    const picked = await vscode.window.showQuickPick(
      open.map(({ task, column }) => ({ label: task.title, description: `${gitRef(task.id)} · ${column}`, detail: task.description?.split("\n")[0] || undefined, id: task.id })),
      { placeHolder, matchOnDescription: true, matchOnDetail: true }
    );
    return picked ? store.findTask(picked.id) : undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("guidon.openBoard", () => BoardPanel.show(context, store, commands)),
    vscode.commands.registerCommand("guidon.login", () => commands.login()),
    vscode.commands.registerCommand("guidon.logout", () => commands.logout()),
    vscode.commands.registerCommand("guidon.refresh", () => store.refresh()),
    vscode.commands.registerCommand("guidon.pickProject", async () => {
      if (store.projects.length === 0) await store.refresh();
      const picked = await vscode.window.showQuickPick(store.projects.map((p) => ({ label: p.name, id: p.id })), { placeHolder: "Guidon project" });
      if (picked) await store.selectProject(picked.id);
    }),
    vscode.commands.registerCommand("guidon.insertRef", async () => {
      const git = await gitApi();
      const repo = git && currentRepository(git);
      if (!repo) return void vscode.window.showWarningMessage("Guidon: open a folder with a Git repository first.");
      const task = await pickTask("Which task is this commit for?");
      if (task) repo.inputBox.value = withRef(repo.inputBox.value, task.id);
    }),
    vscode.commands.registerCommand("guidon.startTask", async () => {
      const task = await pickTask("Start which task on a new branch?");
      if (task) await commands.startBranch(task.id);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("guidon.baseUrl")) store.emit();
    })
  );

  if (apiKey) void store.refresh();
}

export function deactivate(): void {}
