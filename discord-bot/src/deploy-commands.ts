import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import * as link from "./commands/link.js";
import * as webhook from "./commands/webhook.js";
import * as task from "./commands/task.js";

/**
 * Registers slash commands globally (propagates to every server the bot is
 * in within ~1 hour, per Discord's own caching - the tradeoff for not
 * needing a guild id here). Run once after changing any command's
 * definition: `npm run deploy-commands`. Not run automatically on every
 * bot startup - registering on every restart would hit Discord's global
 * command rate limit needlessly for a set of commands that rarely changes.
 */
const commands = [link.data.toJSON(), webhook.data.toJSON(), task.data.toJSON()];

const rest = new REST().setToken(config.discordToken);

const result = (await rest.put(Routes.applicationCommands(config.discordClientId), { body: commands })) as unknown[];

console.log(`Registered ${result.length} application commands.`);
