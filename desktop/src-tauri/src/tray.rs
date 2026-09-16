// Tray icon (Task 3): a Windows system-tray icon that keeps the app
// reachable after the main window is closed-to-tray (see windows.rs).
// Left-clicking the icon itself toggles the main window's visibility;
// right-clicking shows a menu with "Show/Hide Guidon" and "Quit" - only
// "Quit" calls the real `app.exit()`. Reuses the app's existing bundled
// icon (icons/icon.ico, embedded from tauri.conf.json's bundle.icon list)
// rather than shipping a separate tray-specific asset - see the icon note
// in desktop/README.md.
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;

use crate::windows::{log_app_error, toggle_main_window};

const SHOW_HIDE_MENU_ID: &str = "tray_show_hide";
const QUIT_MENU_ID: &str = "tray_quit";

/// Build and install the tray icon, its right-click menu, and its own
/// left-click toggle behavior. Degrades gracefully (logs and skips tray
/// setup, rather than crashing the whole app) if the bundled icon is
/// unexpectedly missing - the app is still fully usable without a tray
/// icon, so this shouldn't be a fatal `setup()` error.
pub(crate) fn setup(app: &mut App) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        log_app_error(
            app.handle(),
            "tray setup skipped: no default window icon (tauri.conf.json's bundle.icon list may be empty)",
        );
        return Ok(());
    };

    let show_hide = MenuItemBuilder::with_id(SHOW_HIDE_MENU_ID, "Show/Hide Guidon").build(app)?;
    let quit = MenuItemBuilder::with_id(QUIT_MENU_ID, "Quit").build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .item(&show_hide)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Guidon Desktop")
        .menu(&tray_menu)
        // The menu above is still reachable via right-click regardless of
        // this setting (that's native OS tray behavior). Without turning
        // this off, a *left* click would also pop the menu instead of
        // reaching on_tray_icon_event below, so plain click-to-toggle would
        // never fire.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id() == SHOW_HIDE_MENU_ID {
                toggle_main_window(app);
            } else if event.id() == QUIT_MENU_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
