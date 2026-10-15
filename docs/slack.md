# Slack integration

The `/guidon` slash command lets a team work on a Guidon project from a Slack
channel. Unlike the Discord bot (`discord-bot/`), it needs no separate
process: Slack sends each command as an HTTPS request to the web app
(`POST /api/integrations/slack/commands`), which answers it directly.

| Command | What it does | Who sees the reply |
|---|---|---|
| `/guidon list [status\|all]` | Tasks of the channel's project (default: To Do, In Progress, AI Working, Review), up to 20, with links | only you |
| `/guidon start <task>` | Moves the task to In Progress | the channel |
| `/guidon done <task>` | Moves the task to Done | the channel |
| `/guidon comment <task> <text>` | Comments on the task, signed with your Slack name | the channel |
| `/guidon link` | A link to connect this channel to a project | only you |
| `/guidon help` | The list above | only you |

`<task>` is the reference `/guidon list` prints - `guidon#1a2b3c4d` - the same
one the GitHub integration and the editor plugins use. The bare 8
characters or the full id work too.

Status changes made in Slack go through the same task events as the board,
so the organization's webhooks ([webhooks.md](./webhooks.md)) - including a
Slack incoming webhook for notifications - report them too.

## How it's secured

- Every request must carry a valid `X-Slack-Signature` for
  `SLACK_SIGNING_SECRET`, at most five minutes old; anything else is a 401.
- A channel is connected to one project (migration 056,
  `slack_integrations`). Connecting it is done in Guidon by a signed-in
  owner or admin of that project, via a signed link valid for ten minutes.
- Commands then run **as the person who connected the channel**, under their
  row-level security - they can never do more than that person could in the
  browser, and only in the channel's project. Comments and status changes
  show up as "Slack bot"; the comment text names the Slack user who sent it.
- Anyone in a connected channel can use the commands, so connect only
  channels whose members should be able to move tasks in that project.
- If that person loses their role in the project or deletes their account,
  the channel stops working until someone connects it again.

## Setting up the Slack app (once per Guidon server)

1. Go to <https://api.slack.com/apps> → **Create New App** → **From an app
   manifest**, pick your workspace and paste this, with your Guidon URL in
   place of `https://useguidon.com`:

   ```yaml
   display_information:
     name: Guidon
     description: Guidon tasks in Slack
   features:
     bot_user:
       display_name: Guidon
     slash_commands:
       - command: /guidon
         url: https://useguidon.com/api/integrations/slack/commands
         description: List, start, finish and comment on Guidon tasks
         usage_hint: list | start <task> | done <task> | comment <task> <text> | link
         should_escape: false
   oauth_config:
     scopes:
       bot:
         - commands
   settings:
     org_deploy_enabled: false
     socket_mode_enabled: false
   ```

2. **Basic Information → App Credentials → Signing Secret**: copy it into the
   Guidon server's environment as `SLACK_SIGNING_SECRET` and restart. Without
   it the command URL answers 404 and project settings say Slack isn't set up.
3. **Install App** → install it to the workspace. Other workspaces can
   install it too if you turn on public distribution in **Manage
   Distribution**; one Guidon server serves any number of workspaces.

## Connecting a channel

1. In the channel, type `/guidon link`.
2. Open the link (only you see it), sign in to Guidon if needed, choose the
   project and **Connect**. You need to be an owner or admin of it.
3. The project's **Settings → Slack** lists the connected channels; owners
   and admins can disconnect them there.

A channel is connected to one project at a time; connecting it again to
another project moves it (if you manage both). A project can have several
channels.
