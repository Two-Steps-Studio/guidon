/**
 * Which Guidon Desktop installers to offer on /download, picked from the
 * GitHub Releases the desktop release workflow publishes (tags
 * `desktop-v<version>`, .github/workflows/desktop-release.yml). No imports,
 * so tests run it with Node's type stripping.
 */

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  published_at: string | null;
  assets: ReleaseAsset[];
}

export type InstallerKind = "windowsSetup" | "windowsMsi" | "appImage" | "deb" | "rpm";

export interface DesktopDownloads {
  version: string;
  notesUrl: string;
  publishedAt: string | null;
  installers: Partial<Record<InstallerKind, { url: string; name: string; size: number }>>;
}

const KINDS: [InstallerKind, RegExp][] = [
  ["windowsSetup", /-setup\.exe$/i],
  ["windowsMsi", /\.msi$/i],
  ["appImage", /\.AppImage$/i],
  ["deb", /\.deb$/i],
  ["rpm", /\.rpm$/i],
];

/** The newest published (not draft, not pre-release) desktop release with its installers; null when there is none yet. */
export function pickDesktopDownloads(releases: readonly Release[]): DesktopDownloads | null {
  const release = releases.find((item) => !item.draft && !item.prerelease && item.tag_name.startsWith("desktop-v"));
  if (!release) return null;
  const installers: DesktopDownloads["installers"] = {};
  for (const asset of release.assets) {
    // The updater's .sig files and latest.json are not for people.
    if (asset.name.endsWith(".sig")) continue;
    const kind = KINDS.find(([, pattern]) => pattern.test(asset.name))?.[0];
    if (kind && !installers[kind]) installers[kind] = { url: asset.browser_download_url, name: asset.name, size: asset.size };
  }
  if (Object.keys(installers).length === 0) return null;
  return { version: release.tag_name.slice("desktop-v".length), notesUrl: release.html_url, publishedAt: release.published_at, installers };
}
