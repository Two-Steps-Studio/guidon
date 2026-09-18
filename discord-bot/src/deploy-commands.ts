import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import * as link from "./commands/link.js";
import * as webhook from "./commands/webhook.js";
import * as taskList from "./commands/task-list.js";
import * as taskStart from "./commands/task-start.js";
import * as taskComplete from "./commands/task-complete.js";
import * as taskComment from "./commands/task-comment.js";

/**
 * Registers slash commands globally (propagates to every server the bot is
 * in within ~1 hour, per Discord's own caching - the tradeoff for not
 * needing a guild id here). Run once after changing any command's
 * definition: `npm run deploy-commands`. Not run automatically on every
 * bot startup - registering on every restart would hit Discord's global
 * command rate limit needlessly for a set of commands that rarely changes.
 *
 * This is a full overwrite (rest.put replaces Discord's whole command set
 * for this application), not an incremental add - so replacing task.ts's
 * single /task entry with the four /task-* entries below also unregisters
 * the old /task command automatically, no separate cleanup step needed.
 */
const commands = [
  link.data.toJSON(),
  webhook.data.toJSON(),
  taskList.data.toJSON(),
  taskStart.data.toJSON(),
  taskComplete.data.toJSON(),
  taskComment.data.toJSON(),
];

const rest = new REST().setToken(config.discordToken);

const result = (await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands })) as unknown[];

console.log(`Registered ${result.length} application commands.`);
