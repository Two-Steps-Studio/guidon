# Guidon Reports for Unreal Engine 5

In-game bug reports straight into Guidon. A player or tester presses **F9**
(configurable; not F8, which is Play-In-Editor's "eject"). The game pauses
and shows a small form. **Send** creates a Backlog task titled `[Bug] …` /
`[Crash] …` / `[Feedback] …`, labelled `in-game`, with:

- a **screenshot** (JPEG) taken just before the form appeared,
- the **recent log** (the last 300 lines by default; logging is compiled out
  of Shipping builds),
- a table of **details**: project, build version and configuration, engine
  version, platform, OS, CPU, GPU, memory, level, game time, resolution, FPS
  and the player pawn's location, plus anything your game adds.

This is a **Runtime** plugin, separate from the editor-only
[Guidon Tasks](../GuidonTasks/README.md) board: it ships inside your game.

> **Status: not compiled yet.** It was written without an Unreal Engine
> toolchain available. It targets **UE 5.4+** and uses the stock `HTTP`,
> `ImageWrapper`, `Slate` and `DeveloperSettings` modules. The server
> endpoint it posts to was tested end to end with the exact multipart layout
> this plugin writes. Please report first-build errors together with your
> engine version.

## Setup

1. Copy `GuidonReports` into your project's `Plugins/` folder and rebuild.
2. On the Guidon website, go to **Profile → API Keys** and create a key with
   **only** the `reports:write` scope. It must be created by an owner, admin
   or developer of the project.
3. In **Project Settings → Plugins → Guidon Reports**, fill in the **Base
   Url**, the **Project Id** (the id in the project's URL, `/projects/<id>/…`)
   and the **Report Key**.

The reporter is a `GameInstanceSubsystem`, so it starts with the game and
needs no setup in any level.

> **The report key ships inside your game** (it's saved to
> `Config/DefaultGame.ini`). Treat it as public. That's why it must have only
> `reports:write`: that scope can file reports and nothing else, and the
> server enforces this. If it leaks and gets abused, revoke it on the
> website and ship a new one.

The reporter doesn't run in **Shipping** builds unless you turn on
**Enabled In Shipping**, e.g. for a public playtest.

## From Blueprints or C++

- `Get Game Instance Subsystem (Guidon Reports Subsystem)` → **Open Report
  Form**, e.g. from a pause-menu button.
- **Submit Report** sends a report from your own UI (title, description,
  category, extra metadata, screenshot on or off) and calls your event with
  the result.
- C++: `Subsystem->CollectMetadata.AddLambda([](TMap<FString, FString>& M) { M.Add(TEXT("quest"), ...); });`

While the form is open, input goes to the form (UI-only input mode, cursor
shown). On close, the plugin switches back to **Game Only** input and hides
the cursor. A game that uses a different input mode should re-apply its own.
