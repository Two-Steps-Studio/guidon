# Guidon Desktop changelog

Release notes for each version. The release workflow
(`.github/workflows/desktop-release.yml`) copies the section matching the
version being released into the GitHub Release and the updater's
`latest.json`, so "Check for Updates" shows it too.

## 1.0.0

First stable release, for Windows and Linux.

- **Install editor plugins into your project.** Guidon Desktop → Install
  Editor Plugins (also in the tray): pick Unity, Unreal Engine, Godot or
  Blender, choose your project folder, and the plugin lands where the
  engine expects it (`Assets/`, `Plugins/`, `addons/`). Running it again
  updates the plugin in place and keeps your own files. Unity, Unreal and
  Godot are one download each (board, moodboard and in-game reports
  together); if the separate Tasks/Reports plugins from before are still in
  the project, the installer points them out so you can delete them.
- **Updates on startup.** The app checks for a new version once when it
  starts and asks before installing anything. "Check for Updates..." still
  works any time.
- **One instance.** Starting Guidon Desktop while it's already running
  brings the existing window to the front instead of opening a second copy
  with a second tray icon.
- **Remembers your windows.** Size and position of the main and Tasks
  windows are kept between launches; the main window now opens at
  1280×800 the first time.
- Tasks window (Ctrl+Shift+T), close-to-tray, start with Windows and a
  self-hosted server URL in Settings, as before.
