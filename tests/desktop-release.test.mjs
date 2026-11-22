// Installers offered on /download (src/lib/desktop/desktop-release-core.ts).
import assert from "node:assert/strict";
import { pickDesktopDownloads } from "../src/lib/desktop/desktop-release-core.ts";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (error) { failed++; console.log(`  FAIL  ${name}\n        ${error.message}`); }
}
const asset = (name) => ({ name, browser_download_url: `https://example.test/${name}`, size: 1000 });
const release = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, html_url: `https://example.test/${tag}`, published_at: "2026-11-22T10:00:00Z", assets: [], ...extra });

check("nothing released yet -> null", () => assert.equal(pickDesktopDownloads([]), null));
check("drafts, pre-releases and other tags are skipped", () => {
  const result = pickDesktopDownloads([
    release("desktop-v1.2.0", { draft: true, assets: [asset("Guidon Desktop_1.2.0_x64-setup.exe")] }),
    release("desktop-v1.1.0-beta", { prerelease: true, assets: [asset("b.msi")] }),
    release("sdk-v3.0.0", { assets: [asset("sdk.msi")] }),
    release("desktop-v1.0.0", { assets: [asset("Guidon Desktop_1.0.0_x64-setup.exe")] }),
  ]);
  assert.equal(result.version, "1.0.0");
});
check("every installer kind is found, signatures and latest.json are not", () => {
  const result = pickDesktopDownloads([release("desktop-v1.0.0", { assets: [
    "Guidon Desktop_1.0.0_x64-setup.exe", "Guidon Desktop_1.0.0_x64-setup.exe.sig", "Guidon Desktop_1.0.0_x64_en-US.msi",
    "Guidon Desktop_1.0.0_amd64.AppImage", "Guidon Desktop_1.0.0_amd64.AppImage.sig", "Guidon Desktop_1.0.0_amd64.deb",
    "Guidon Desktop-1.0.0-1.x86_64.rpm", "latest.json",
  ].map(asset) })]);
  assert.deepEqual(Object.keys(result.installers).sort(), ["appImage", "deb", "rpm", "windowsMsi", "windowsSetup"]);
  assert.equal(result.installers.windowsSetup.name, "Guidon Desktop_1.0.0_x64-setup.exe");
  assert.equal(result.installers.appImage.name, "Guidon Desktop_1.0.0_amd64.AppImage");
});
check("a release with no installers is treated as none", () => assert.equal(pickDesktopDownloads([release("desktop-v1.0.0", { assets: [asset("latest.json")] })]), null));

console.log(`\n  ${passed} pass / ${failed} fail\n`);
if (failed) process.exit(1);
