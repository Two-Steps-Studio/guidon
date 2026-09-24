import * as vscode from "vscode";

/** The subset of the built-in Git extension's API used here (vscode.git, API version 1). */
interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: { HEAD?: { name?: string } };
  createBranch(name: string, checkout: boolean): Promise<void>;
}

interface GitApi {
  repositories: GitRepository[];
}

export async function gitApi(): Promise<GitApi | null> {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
  if (!extension) return null;
  // Both extensions can activate on the same onStartupFinished event with no
  // ordering guarantee, so vscode.git may not be active yet even right after
  // VS Code opens - activate() is a no-op once it already is.
  const exports = extension.isActive ? extension.exports : await extension.activate();
  return exports.getAPI(1);
}

/** The repository of the active editor, else the only/first one. */
export function currentRepository(api: GitApi): GitRepository | null {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    const match = api.repositories
      .filter((repo) => active.fsPath.startsWith(repo.rootUri.fsPath))
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];
    if (match) return match;
  }
  return api.repositories[0] ?? null;
}
