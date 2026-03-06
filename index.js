import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes, ActivityType } from "discord.js";
import { commands, handleProxyCommands } from "./commands/proxy.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// 🔥 Dynamic Host Name
const HOST_NAME = process.env.HOST_NAME || "BonerHosting";

// Rotating status config
const STATUS_ROTATE_MS = Number(process.env.STATUS_ROTATE_MS || 15_000);

const statusMessages = [
  { type: ActivityType.Watching, text: `${HOST_NAME} Proxies` },
  { type: ActivityType.Playing, text: "/createproxy" },
  { type: ActivityType.Watching, text: `${HOST_NAME} Infrastructure` },
  { type: ActivityType.Listening, text: "proxy requests" }
];

function startRotatingStatus() {
  let i = 0;

  const set = () => {
    const s = statusMessages[i % statusMessages.length];
    client.user?.setPresence({
      activities: [{ name: s.text, type: s.type }],
      status: "online"
    });
    i++;
  };

  set();
  setInterval(set, STATUS_ROTATE_MS);
}

client.once("clientReady", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`${HOST_NAME}`);

  startRotatingStatus();

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log("✅ Slash commands registered");
});

client.on("interactionCreate", async interaction => {
  try {
    if (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu()
    ) {
      await handleProxyCommands(interaction);
    }
  } catch (err) {
    console.error("interaction error:", err);

    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "❌ Error handling that action.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: "❌ Error handling that action.",
            ephemeral: true
          });
        }
      }
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN);

export { client };