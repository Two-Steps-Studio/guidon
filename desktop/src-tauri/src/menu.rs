// Native application menu: its "Settings..." item is the only entry point
// into the Settings window, since the main window (untrusted remote
// content, zero API access) can't open it itself. Its "Check for
// Updates..." item (Task 5) is the only entry point into the manual update
// check for the same reason - see updater.rs for why that check is a
// direct Rust-side plugin call rather than a command the Settings window
// invokes.
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::App;

use crate::updater::check_for_updates;
use crate::windows::open_or_focus_settings;

const OPEN_SETTINGS_MENU_ID: &str = "open_settings";
const CHECK_FOR_UPDATES_MENU_ID: &str = "check_for_updates";

/// Build and install the native application menu, and wire up its event
/// handling.
pub(crate) fn setup(app: &mut App) -> tauri::Result<()> {
    let open_settings =
        MenuItemBuilder::with_id(OPEN_SETTINGS_MENU_ID, "Settings...").build(app)?;
    let check_for_updates_item =
        MenuItemBuilder::with_id(CHECK_FOR_UPDATES_MENU_ID, "Check for Updates...").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Guidon Desktop")
        .item(&open_settings)
        .item(&check_for_updates_item)
        .separator()
        .quit()
        .build()?;
    let menu = MenuBuilder::new(app).item(&app_menu).build()?;
    app.set_menu(menu)?;

    let handle = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        if event.id() == OPEN_SETTINGS_MENU_ID {
            open_or_focus_settings(&handle);
        } else if event.id() == CHECK_FOR_UPDATES_MENU_ID {
            check_for_updates(&handle);
        }
    });

    Ok(())
}
