// Editor plugin installer: the "Install Editor Plugins" window
// (src/plugins.html + plugins.js, local bundled content) lists the plugins
// the connected Guidon server offers, lets the user pick a project folder,
// and extracts the chosen plugin into the right place inside it - e.g.
// `<Unity project>/Assets/GuidonTasks`, `<Unreal project>/Plugins/...`,
// `<Godot project>/addons/...` - instead of unzipping and copying by hand.
//
// Where things go comes from the server, not from this app: the web app's
// scripts/build-plugin-zips.mjs publishes /downloads/plugins/manifest.json
// with each zip's SHA-256 and plugins/catalog.json's `install` spec. So a
// new plugin, or a fixed install path, ships with the server and needs no
// desktop release, and the files always match the server the plugin will
// talk to.
//
// Safety, since this writes into the user's projects:
// - the zip is downloaded from the manifest's own entry (never a URL the
//   window passes in) and must match the manifest's SHA-256 and size cap;
// - every entry must sit under the download's `root` folder and resolve
//   inside the target - no absolute paths, no `..` (zip-slip);
// - files are written over existing ones but nothing is ever deleted, so a
//   re-install updates the plugin while keeping Unity's .meta files (their
//   GUIDs are what scenes reference) and anything the user added next to it.
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use url::Url;

use crate::store::stored_server_url;

/// Largest plugin zip this will download - today's are well under 1 MB.
const MAX_ZIP_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Manifest {
    pub plugins: Vec<ManifestPlugin>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ManifestPlugin {
    pub id: String,
    pub name: String,
    pub requires: Option<String>,
    pub downloads: Vec<ManifestDownload>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ManifestDownload {
    pub id: String,
    pub kind: String,
    pub file: String,
    pub root: String,
    pub size: u64,
    pub sha256: String,
    pub install: Option<InstallSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct InstallSpec {
    /// Sub-folder of the chosen folder the zip's `root` goes into ("" = the folder itself).
    pub into: String,
    /// Relative path, or `*.ext` for any top-level file with that extension,
    /// that identifies the right kind of folder. None = any folder.
    pub marker: Option<String>,
    /// What to pick, shown in the window.
    pub folder: String,
    /// What to do after installing; `{server}` is replaced with the server URL.
    pub next: String,
}

/// The last manifest fetched, with the server it came from - install and
/// check work from this, so the window only ever passes ids and a folder.
#[derive(Default)]
pub(crate) struct PluginState(Mutex<Option<(Url, Manifest)>>);

#[derive(Serialize)]
pub(crate) struct CatalogView {
    server: String,
    plugins: Vec<PluginView>,
}

#[derive(Serialize)]
pub(crate) struct PluginView {
    id: String,
    name: String,
    requires: Option<String>,
    downloads: Vec<DownloadView>,
}

#[derive(Serialize)]
pub(crate) struct DownloadView {
    id: String,
    kind: String,
    folder: String,
}

#[derive(Serialize)]
pub(crate) struct FolderCheck {
    /// The folder has the plugin's marker (e.g. project.godot).
    looks_right: bool,
    /// Where the plugin would end up.
    target: String,
    /// Something is already there - installing updates it.
    already_installed: bool,
}

#[derive(Serialize)]
pub(crate) struct InstallReport {
    target: String,
    files: usize,
    updated: bool,
    next: String,
}

/// `<server>/downloads/plugins/<file>`, keeping a self-hosted sub-path
/// (same reasoning as windows.rs's tasks_url).
pub(crate) fn plugin_file_url(server: &Url, file: &str) -> Url {
    let mut url = server.clone();
    url.set_query(None);
    url.set_fragment(None);
    if let Ok(mut segments) = url.path_segments_mut() {
        segments
            .pop_if_empty()
            .extend(["downloads", "plugins", file]);
    }
    url
}

/// Relative path from a manifest string, refusing anything that could
/// leave the folder it's joined onto.
fn relative_path(raw: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::new();
    for part in raw.split('/').filter(|part| !part.is_empty()) {
        match Path::new(part).components().next() {
            Some(Component::Normal(name)) if Path::new(part).components().count() == 1 => {
                path.push(name)
            }
            _ => return Err(format!("unsafe path in plugin manifest: {raw}")),
        }
    }
    Ok(path)
}

pub(crate) fn marker_matches(folder: &Path, marker: Option<&str>) -> bool {
    let Some(marker) = marker else {
        return true;
    };
    if let Some(extension) = marker.strip_prefix("*.") {
        return fs::read_dir(folder)
            .map(|entries| {
                entries.flatten().any(|entry| {
                    entry.path().is_file()
                        && entry.path().extension().and_then(|e| e.to_str()) == Some(extension)
                })
            })
            .unwrap_or(false);
    }
    relative_path(marker)
        .map(|rel| folder.join(rel).exists())
        .unwrap_or(false)
}

/// The folder the zip's entries are extracted into (its `root` folder
/// lands inside this), and the plugin's own folder within it.
pub(crate) fn install_paths(
    folder: &Path,
    spec: &InstallSpec,
    root: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let base = folder.join(relative_path(&spec.into)?);
    let target = base.join(relative_path(root)?);
    Ok((base, target))
}

pub(crate) fn verify_sha256(bytes: &[u8], expected_hex: &str) -> Result<(), String> {
    let actual: String = Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if actual.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err("The downloaded plugin doesn't match the server's checksum. Try again.".into())
    }
}

/// Extract every file under `root/` in the zip into `base`, overwriting
/// files that exist and deleting nothing. Returns how many files were written.
pub(crate) fn extract_plugin(bytes: &[u8], root: &str, base: &Path) -> Result<usize, String> {
    let root = relative_path(root)?;
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("Not a valid zip: {e}"))?;

    // Validate every entry before writing anything, so a bad archive
    // leaves the project untouched.
    let mut planned = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let Some(path) = entry.enclosed_name() else {
            return Err(format!("unsafe path in plugin zip: {}", entry.name()));
        };
        if !path.starts_with(&root)
            || path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(format!("unexpected file in plugin zip: {}", entry.name()));
        }
        if !entry.is_dir() {
            planned.push((index, base.join(path)));
        }
    }

    for (index, dest) in &planned {
        let mut entry = archive.by_index(*index).map_err(|e| e.to_string())?;
        let mut data = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Can't create {}: {e}", parent.display()))?;
        }
        fs::write(dest, data).map_err(|e| format!("Can't write {}: {e}", dest.display()))?;
    }
    Ok(planned.len())
}

fn http_client() -> Result<reqwest::Client, String> {
    // reqwest is built without a bundled TLS provider (same arrangement as
    // tauri-plugin-updater, whose rustls/ring this reuses).
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("GuidonDesktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_bytes(url: Url, limit: u64) -> Result<Vec<u8>, String> {
    let response = http_client()?.get(url.clone()).send().await.map_err(|_| {
        format!(
            "Can't reach {}. Check the server URL in Settings.",
            url.host_str().unwrap_or("the server")
        )
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "{url} answered HTTP {}.",
            response.status().as_u16()
        ));
    }
    if response.content_length().is_some_and(|len| len > limit) {
        return Err("The download is larger than expected.".into());
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("The download is larger than expected.".into());
    }
    Ok(bytes.to_vec())
}

fn find_download<'a>(
    manifest: &'a Manifest,
    download_id: &str,
) -> Result<(&'a ManifestDownload, &'a InstallSpec), String> {
    manifest
        .plugins
        .iter()
        .flat_map(|plugin| plugin.downloads.iter())
        .find(|download| download.id == download_id)
        .and_then(|download| download.install.as_ref().map(|spec| (download, spec)))
        .ok_or_else(|| "That plugin can't be installed from here.".into())
}

fn cached(state: &PluginState) -> Result<(Url, Manifest), String> {
    state
        .0
        .lock()
        .map_err(|_| "internal error".to_string())?
        .clone()
        .ok_or_else(|| "Load the plugin list first.".into())
}

fn existing_folder(folder: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(folder);
    if path.is_dir() {
        Ok(path)
    } else {
        Err("That folder doesn't exist.".into())
    }
}

/// Fetch the server's plugin manifest and return the installable plugins.
#[tauri::command]
pub(crate) async fn plugin_catalog(
    app: AppHandle,
    state: State<'_, PluginState>,
) -> Result<CatalogView, String> {
    let server = stored_server_url(&app);
    let bytes = fetch_bytes(plugin_file_url(&server, "manifest.json"), 1024 * 1024).await?;
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| {
        "This server doesn't offer plugin installs yet - update it to the latest Guidon."
            .to_string()
    })?;

    let plugins = manifest
        .plugins
        .iter()
        .filter_map(|plugin| {
            let downloads: Vec<DownloadView> = plugin
                .downloads
                .iter()
                .filter_map(|download| {
                    download.install.as_ref().map(|spec| DownloadView {
                        id: download.id.clone(),
                        kind: download.kind.clone(),
                        folder: spec.folder.clone(),
                    })
                })
                .collect();
            (!downloads.is_empty()).then(|| PluginView {
                id: plugin.id.clone(),
                name: plugin.name.clone(),
                requires: plugin.requires.clone(),
                downloads,
            })
        })
        .collect();

    let view = CatalogView {
        server: server.to_string(),
        plugins,
    };
    *state.0.lock().map_err(|_| "internal error".to_string())? = Some((server, manifest));
    Ok(view)
}

/// Native folder picker. Async commands run off the main thread, which the
/// blocking dialog call requires.
#[tauri::command]
pub(crate) async fn pick_plugin_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Choose your project folder")
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn check_plugin_folder(
    state: State<'_, PluginState>,
    download_id: String,
    folder: String,
) -> Result<FolderCheck, String> {
    let (_, manifest) = cached(&state)?;
    let (download, spec) = find_download(&manifest, &download_id)?;
    let folder = existing_folder(&folder)?;
    let (_, target) = install_paths(&folder, spec, &download.root)?;
    Ok(FolderCheck {
        looks_right: marker_matches(&folder, spec.marker.as_deref()),
        already_installed: target.exists(),
        target: target.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) async fn install_plugin(
    state: State<'_, PluginState>,
    download_id: String,
    folder: String,
) -> Result<InstallReport, String> {
    let (server, manifest) = cached(&state)?;
    let (download, spec) = find_download(&manifest, &download_id)?;
    let folder = existing_folder(&folder)?;
    let (base, target) = install_paths(&folder, spec, &download.root)?;

    let bytes = fetch_bytes(
        plugin_file_url(&server, &download.file),
        MAX_ZIP_BYTES.min(download.size.max(1) * 2),
    )
    .await?;
    verify_sha256(&bytes, &download.sha256)?;

    let updated = target.exists();
    let files = extract_plugin(&bytes, &download.root, &base)?;
    let server_text = server.as_str().trim_end_matches('/');
    Ok(InstallReport {
        target: target.to_string_lossy().into_owned(),
        files,
        updated,
        next: spec.next.replace("{server}", server_text),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_of(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, body) in entries {
            if name.ends_with('/') {
                writer
                    .add_directory(*name, SimpleFileOptions::default())
                    .unwrap();
            } else {
                writer
                    .start_file(*name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(body.as_bytes()).unwrap();
            }
        }
        writer.finish().unwrap().into_inner()
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("guidon-plugins-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn spec(into: &str, marker: Option<&str>) -> InstallSpec {
        InstallSpec {
            into: into.into(),
            marker: marker.map(Into::into),
            folder: String::new(),
            next: String::new(),
        }
    }

    #[test]
    fn manifest_url_keeps_sub_path() {
        let url =
            |raw: &str| plugin_file_url(&Url::parse(raw).unwrap(), "manifest.json").to_string();
        assert_eq!(
            url("https://useguidon.com"),
            "https://useguidon.com/downloads/plugins/manifest.json"
        );
        assert_eq!(
            url("https://example.com/guidon/"),
            "https://example.com/guidon/downloads/plugins/manifest.json"
        );
    }

    #[test]
    fn install_paths_per_engine() {
        let project = Path::new("/p");
        assert_eq!(
            install_paths(project, &spec("Assets", None), "GuidonTasks")
                .unwrap()
                .1,
            Path::new("/p/Assets/GuidonTasks")
        );
        assert_eq!(
            install_paths(project, &spec("Plugins", None), "GuidonTasks")
                .unwrap()
                .1,
            Path::new("/p/Plugins/GuidonTasks")
        );
        assert_eq!(
            install_paths(project, &spec("", None), "addons/guidon_tasks")
                .unwrap()
                .1,
            Path::new("/p/addons/guidon_tasks")
        );
        assert!(install_paths(project, &spec("../x", None), "GuidonTasks").is_err());
        assert!(install_paths(project, &spec("", None), "/etc")
            .is_ok_and(|(_, t)| t == Path::new("/p/etc")));
        assert!(install_paths(project, &spec("", None), "a/../../b").is_err());
    }

    #[test]
    fn markers() {
        let dir = temp_dir("markers");
        assert!(!marker_matches(&dir, Some("project.godot")));
        fs::write(dir.join("project.godot"), "").unwrap();
        assert!(marker_matches(&dir, Some("project.godot")));
        assert!(!marker_matches(&dir, Some("*.uproject")));
        fs::write(dir.join("MyGame.uproject"), "{}").unwrap();
        assert!(marker_matches(&dir, Some("*.uproject")));
        fs::create_dir_all(dir.join("ProjectSettings")).unwrap();
        fs::write(dir.join("ProjectSettings/ProjectVersion.txt"), "").unwrap();
        assert!(marker_matches(
            &dir,
            Some("ProjectSettings/ProjectVersion.txt")
        ));
        assert!(marker_matches(&dir, None));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn extracts_under_root_and_keeps_existing_files() {
        let dir = temp_dir("extract");
        let base = dir.join("Assets");
        fs::create_dir_all(base.join("GuidonTasks")).unwrap();
        fs::write(base.join("GuidonTasks/Old.cs.meta"), "keep").unwrap();
        fs::write(base.join("GuidonTasks/Window.cs"), "old").unwrap();

        let bytes = zip_of(&[
            ("GuidonTasks/", ""),
            ("GuidonTasks/Window.cs", "new"),
            ("GuidonTasks/Editor/A.cs", "a"),
        ]);
        assert_eq!(extract_plugin(&bytes, "GuidonTasks", &base).unwrap(), 2);
        assert_eq!(
            fs::read_to_string(base.join("GuidonTasks/Window.cs")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(base.join("GuidonTasks/Editor/A.cs")).unwrap(),
            "a"
        );
        assert_eq!(
            fs::read_to_string(base.join("GuidonTasks/Old.cs.meta")).unwrap(),
            "keep"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_zip_slip_and_foreign_entries_without_writing() {
        let dir = temp_dir("slip");
        let evil = zip_of(&[
            ("GuidonTasks/ok.txt", "x"),
            ("GuidonTasks/../../evil.txt", "x"),
        ]);
        assert!(extract_plugin(&evil, "GuidonTasks", &dir).is_err());
        let foreign = zip_of(&[("GuidonTasks/ok.txt", "x"), ("Other/x.txt", "x")]);
        assert!(extract_plugin(&foreign, "GuidonTasks", &dir).is_err());
        assert!(
            !dir.join("GuidonTasks/ok.txt").exists(),
            "nothing written when any entry is bad"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn nested_root_for_godot() {
        let dir = temp_dir("godot");
        let bytes = zip_of(&[("addons/guidon_tasks/plugin.cfg", "cfg")]);
        assert_eq!(
            extract_plugin(&bytes, "addons/guidon_tasks", &dir).unwrap(),
            1
        );
        assert!(dir.join("addons/guidon_tasks/plugin.cfg").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    /// End to end against a running Guidon server (manifest, public zip
    /// route, checksums, extraction): `GUIDON_TEST_SERVER=http://localhost:2137
    /// cargo test --lib live_`. Skipped when the variable isn't set.
    #[test]
    fn live_install_every_plugin_from_server() {
        let Ok(server) = std::env::var("GUIDON_TEST_SERVER") else {
            return;
        };
        let server = Url::parse(&server).unwrap();
        tauri::async_runtime::block_on(async {
            let bytes = fetch_bytes(plugin_file_url(&server, "manifest.json"), 1024 * 1024)
                .await
                .unwrap();
            let manifest: Manifest = serde_json::from_slice(&bytes).unwrap();
            let mut installed = 0;
            for download in manifest.plugins.iter().flat_map(|p| p.downloads.iter()) {
                let Some(spec) = &download.install else {
                    continue;
                };
                let project = temp_dir(&format!("live-{}", download.id));
                let (base, target) = install_paths(&project, spec, &download.root).unwrap();
                let zip = fetch_bytes(plugin_file_url(&server, &download.file), MAX_ZIP_BYTES)
                    .await
                    .unwrap();
                verify_sha256(&zip, &download.sha256).unwrap();
                let files = extract_plugin(&zip, &download.root, &base).unwrap();
                assert!(
                    files > 0 && target.is_dir(),
                    "{} -> {}",
                    download.id,
                    target.display()
                );
                println!(
                    "{}: {files} files -> {}",
                    download.id,
                    target.strip_prefix(&project).unwrap().display()
                );
                fs::remove_dir_all(project).unwrap();
                installed += 1;
            }
            assert!(
                installed >= 7,
                "expected every installable plugin, got {installed}"
            );
        });
    }

    #[test]
    fn checksum() {
        let sha = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"; // "hello"
        assert!(verify_sha256(b"hello", sha).is_ok());
        assert!(verify_sha256(b"hello!", sha).is_err());
    }
}
