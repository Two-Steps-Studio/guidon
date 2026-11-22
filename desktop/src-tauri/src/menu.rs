// Native application menu: its "Settings..." item is the only entry point
// into the Settings window, since the main window (untrusted remote
// content, zero API access) can't open it itself. Its "Check for
// Updates..." item (Task 5) is the only entry point into the manual update
// check for the same reason - see updater.rs for why that check is a
// direct Rust-side plugin call rather than a command the Settings window
// invokes.
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Manager};

use crate::store::stored_server_url;
use crate::updater::check_for_updates;
use crate::windows::{
    open_or_focus_plugins, open_or_focus_settings, open_or_focus_tasks, server_page,
    show_main_window, TASKS_WINDOW_LABEL,
};

const OPEN_SETTINGS_MENU_ID: &str = "open_settings";
const OPEN_TASKS_MENU_ID: &str = "open_tasks";
const CHECK_FOR_UPDATES_MENU_ID: &str = "check_for_updates";
const OPEN_PLUGINS_MENU_ID: &str = "open_plugins";
const GO_DASHBOARD_MENU_ID: &str = "go_dashboard";
const GO_MY_TASKS_MENU_ID: &str = "go_my_tasks";
const GO_BACK_MENU_ID: &str = "go_back";
const GO_FORWARD_MENU_ID: &str = "go_forward";
const RELOAD_MENU_ID: &str = "reload";

/// Build and install the native application menu, and wire up its event
/// handling.
pub(crate) fn setup(app: &mut App) -> tauri::Result<()> {
    let open_settings =
        MenuItemBuilder::with_id(OPEN_SETTINGS_MENU_ID, "Settings...").build(app)?;
    let open_tasks = MenuItemBuilder::with_id(OPEN_TASKS_MENU_ID, "Tasks Window")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;
    let open_plugins =
        MenuItemBuilder::with_id(OPEN_PLUGINS_MENU_ID, "Install Editor Plugins...").build(app)?;
    let check_for_updates_item =
        MenuItemBuilder::with_id(CHECK_FOR_UPDATES_MENU_ID, "Check for Updates...").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Guidon Desktop")
        .item(&open_tasks)
        .item(&open_plugins)
        .item(&open_settings)
        .item(&check_for_updates_item)
        .separator()
        .quit()
        .build()?;
    // The navigation a browser gives you, as an app's menu with shortcuts.
    let go_menu = SubmenuBuilder::new(app, "Go")
        .item(
            &MenuItemBuilder::with_id(GO_DASHBOARD_MENU_ID, "Dashboard")
                .accelerator("CmdOrCtrl+Shift+D")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(GO_MY_TASKS_MENU_ID, "My Tasks")
                .accelerator("CmdOrCtrl+Shift+M")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(GO_BACK_MENU_ID, "Back")
                .accelerator("Alt+Left")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(GO_FORWARD_MENU_ID, "Forward")
                .accelerator("Alt+Right")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(RELOAD_MENU_ID, "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .build()?;
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&go_menu)
        .build()?;
    app.set_menu(menu)?;

    let handle = app.handle().clone();
    let check_for_updates_item_for_event = check_for_updates_item.clone();
    app.on_menu_event(move |_app, event| {
        if event.id() == OPEN_SETTINGS_MENU_ID {
            open_or_focus_settings(&handle);
        } else if event.id() == OPEN_TASKS_MENU_ID {
            open_or_focus_tasks(&handle);
        } else if event.id() == OPEN_PLUGINS_MENU_ID {
            open_or_focus_plugins(&handle);
        } else if event.id() == CHECK_FOR_UPDATES_MENU_ID {
            check_for_updates(&handle, &check_for_updates_item_for_event, false);
        } else if event.id() == GO_DASHBOARD_MENU_ID {
            open_in_main(&handle, "dashboard");
        } else if event.id() == GO_MY_TASKS_MENU_ID {
            open_in_main(&handle, "my-tasks");
        } else if event.id() == GO_BACK_MENU_ID {
            run_in_focused(&handle, "history.back()");
        } else if event.id() == GO_FORWARD_MENU_ID {
            run_in_focused(&handle, "history.forward()");
        } else if event.id() == RELOAD_MENU_ID {
            run_in_focused(&handle, "location.reload()");
        }
    });

    // One quiet check per launch - see updater.rs. Debug builds skip it:
    // their version never matches a release and the dialog would only get
    // in the way while developing.
    if !cfg!(debug_assertions) {
        check_for_updates(app.handle(), &check_for_updates_item, true);
    }

    Ok(())
}

/// Show a page of the web app in the main window.
fn open_in_main(app: &AppHandle, page: &str) {
    let url = server_page(&stored_server_url(app), page);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(url);
    }
    show_main_window(app);
}

/// Back/Forward/Reload act on the Tasks window when it has focus, else on
/// the main window. The script is a fixed string of ours, not page input.
fn run_in_focused(app: &AppHandle, script: &str) {
    let tasks = app
        .get_webview_window(TASKS_WINDOW_LABEL)
        .filter(|window| window.is_focused().unwrap_or(false));
    if let Some(window) = tasks.or_else(|| app.get_webview_window("main")) {
        let _ = window.eval(script);
    }
}
