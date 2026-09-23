# Guidon Reports for Unity

In-game bug reports straight into Guidon. A player or tester presses **F8**
(configurable) and the game pauses to show a small form. **Send** creates a
Backlog task titled `[Bug] …` / `[Crash] …` / `[Feedback] …`, labelled
`in-game`, with:

- a **screenshot** (JPEG) taken just before the form appeared,
- the **recent log** (the last 300 lines by default, with stack traces for
  errors),
- a table of **details**: build version, Unity version, platform, OS, device,
  GPU, memory, scene, resolution, FPS and play time, plus anything your game
  adds.

This is a **runtime** package, separate from the editor-only
[Guidon Tasks](../GuidonTasks/README.md) board: it ships inside your game build.

## Setup

1. Copy the `GuidonReports` folder anywhere under `Assets/`.
2. On the Guidon website, go to **Profile → API Keys** and create a key with
   **only** the `reports:write` scope. It must be created by an owner, admin
   or developer of the project.
3. **Assets → Create → Guidon → Report Settings**. Put the asset in a
   `Resources` folder and keep its name `GuidonReportsSettings`. Fill in the
   **Base Url**, the **Project Id** (the id in the project's URL,
   `/projects/<id>/…`) and the **Report Key**.

That's all: the reporter starts itself before the first scene loads. You
don't add anything to a scene.

> **The report key ships inside your build.** Treat it as public. That's why
> it must have only `reports:write`: that scope can file reports and nothing
> else. It can't read, change or delete anything, and the server enforces
> this. If it leaks and gets abused, revoke it on the website and ship a new
> one.

By default the reporter runs only in the **Editor and development builds**.
Turn on **Enabled In Release Builds** for public playtests or early access.
**Auto Report Exceptions** files a `crash` report automatically on an
unhandled exception: at most one per minute, and one per distinct message per
session.

## From your code

```csharp
using Guidon.Reports;

// Add your own details to every report:
GuidonReporter.CollectMetadata += m => m["player_position"] = player.transform.position.ToString();

// Open the built-in form (e.g. from a pause-menu button):
GuidonReporter.Open();

// Or send from your own UI:
GuidonReporter.Submit("Door clips through wall", "Details…", "bug",
    captureScreenshot: true, done: (ok, message) => Debug.Log(message));
```

The form is IMGUI on purpose. It needs no UI package, Canvas, EventSystem or
Input System setting, so it can't clash with your game's own UI. The hotkey
is read from IMGUI key events for the same reason. Requests go through
`UnityWebRequest`, so there are no dependencies. On WebGL the Guidon server
would also have to allow your game's origin (CORS).

## Verified

- The package compiles with no errors against Unity 2021.3's engine
  reference assemblies (mono `mcs`). It has **not** been run inside the
  Unity player.
- The server side it talks to was tested end to end against a real local
  Guidon: attachments stored, the metadata table, rejection of bad files,
  and a report key that can't read or change anything.
