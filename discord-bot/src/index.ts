import { Client, Events, GatewayIntentBits, type ChatInputCommandInteraction } from "discord.js";
import { config } from "./config.js";
import * as link from "./commands/link.js";
import * as webhook from "./commands/webhook.js";
import * as taskList from "./commands/task-list.js";
import * as taskStart from "./commands/task-start.js";
import * as taskComplete from "./commands/task-complete.js";
import * as taskComment from "./commands/task-comment.js";

const commands = new Map<string, { execute: (interaction: ChatInputCommandInteraction) => Promise<void> }>([
  [link.data.name, link],
  [webhook.data.name, webhook],
  [taskList.data.name, taskList],
  [taskStart.data.name, taskStart],
  [taskComplete.data.name, taskComplete],
  [taskComment.data.name, taskComment],
]);

// Guilds: needed to read interaction.guildId/guild.name. No message-content
// or presence intent - this bot only ever responds to slash commands, it
// never reads ordinary chat messages.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Guidon Discord bot ready as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    await interaction.reply({ content: "This bot only works inside a server, not in DMs.", ephemeral: true });
    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    const message = "Something went wrong running that command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.discordToken);
