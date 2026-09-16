// Native application menu: its one item is the only entry point into the
// Settings window, since the main window (untrusted remote content, zero
// API access) can't open it itself.
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::App;

use crate::windows::open_or_focus_settings;

const OPEN_SETTINGS_MENU_ID: &str = "open_settings";

/// Build and install the native application menu, and wire up its event
/// handling.
pub(crate) fn setup(app: &mut App) -> tauri::Result<()> {
    let open_settings =
        MenuItemBuilder::with_id(OPEN_SETTINGS_MENU_ID, "Settings...").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Guidon Desktop")
        .item(&open_settings)
        .separator()
        .quit()
        .build()?;
    let menu = MenuBuilder::new(app).item(&app_menu).build()?;
    app.set_menu(menu)?;

    let handle = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        if event.id() == OPEN_SETTINGS_MENU_ID {
            open_or_focus_settings(&handle);
        }
    });

    Ok(())
}
