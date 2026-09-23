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

export function gitApi(): GitApi | null {
  const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
  if (!extension || !extension.isActive) return null;
  return extension.exports.getAPI(1);
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
