import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags
} from "discord.js";
import dns from "node:dns/promises";
import { db } from "../db.js";
import {
  createProxyHost,
  deleteProxyHost,
  updateProxyHost,
  ensureLetsEncrypt
} from "../utils/npm.js";


const HOST_NAME = process.env.HOST_NAME || "N/A";
const LOG_CHANNEL_ID = "SET LOG CHANNELl";


function guessNodeFromIp(ip) {
  if (ip === UK1_IP) return "UK1";
  if (ip === UK2_IP) return "UK2";
  return "UNKNOWN";
}

async function sendProxyLog(client, action, data) {
  const colors = {
    create: 0x57f287,
    edit: 0xfee75c,
    delete: 0xed4245
  };

  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`🔁 Proxy ${action.toUpperCase()}`)
      .setColor(colors[action] ?? 0x5865f2)
      .addFields(
        { name: "User", value: `<@${data.userId}> (\`${data.userTag}\`)`, inline: false },
        { name: "Domain", value: `\`${data.domain}\``, inline: true },
        { name: "Target", value: `\`${data.forwardHost}:${data.forwardPort}\``, inline: true },
        { name: "Node", value: `\`${data.node}\``, inline: true },
        ...(data.ssl ? [{ name: "SSL", value: data.ssl, inline: false }] : [])
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch {
  }
}

function getForwardHosts() {
  const raw = process.env.FORWARD_HOSTS || "";
  const items = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [label, ip] = s.split("|").map(x => (x || "").trim());
      return { label: label || ip, ip };
    })
    .filter(x => x.ip);

  return items.length ? items : [{ label: "UK2 Default", ip: UK2_IP }];
}

function cleanDomain(d) {
  return d.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
}

async function resolveA(domain) {
  try {
    return await dns.resolve4(domain);
  } catch {
    return [];
  }
}

const PENDING = new Map();
function makeKey(userId, domain, port, mode) {
  return `${userId}:${domain}:${port}:${mode}`;
}

function makeId(mode, action, userId, port, domain) {
  return `proxy|${mode}|${action}|${userId}|${port}|${domain}`;
}
function parseId(customId) {
  const [ns, mode, action, userId, portStr, ...domainParts] = customId.split("|");
  return { ns, mode, action, userId, port: Number(portStr), domain: domainParts.join("|") };
}


export const commands = [
  new SlashCommandBuilder()
    .setName("createproxy")
    .setDescription("Create a reverse proxy (wizard)")
    .addStringOption(o => o.setName("domain").setDescription("Domain to proxy").setRequired(true))
    .addIntegerOption(o => o.setName("forwardport").setDescription("Port to forward to").setRequired(true)),

  new SlashCommandBuilder()
    .setName("editproxy")
    .setDescription("Edit an existing proxy (wizard)")
    .addStringOption(o => o.setName("domain").setDescription("Domain to edit").setRequired(true))
    .addIntegerOption(o => o.setName("forwardport").setDescription("New port").setRequired(true)),

  new SlashCommandBuilder().setName("listproxy").setDescription("List your proxies"),

  new SlashCommandBuilder()
    .setName("deleteproxy")
    .setDescription("Delete your proxy by domain")
    .addStringOption(o => o.setName("domain").setDescription("Domain to delete").setRequired(true)),

  new SlashCommandBuilder().setName("proxydoc").setDescription("How to proxy (guide)")
];

export async function handleProxyCommands(interaction) {
  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isStringSelectMenu()) return handleSelect(interaction);
  if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === "proxydoc") {
  const hosts = getForwardHosts();

  const hostLines = hosts
    .map(h => `• **${h.label}** → \`${h.ip}\``)
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("📘 How to Proxy")
    .setColor(0x5865f2)
    .setDescription(
      `**Step 1:** Create an A record pointing to one of the following IPs:\n\n` +
      `${hostLines}\n\n` +
      `**Step 2:** Run \`/createproxy domain:<domain> forwardport:<port>\`\n` +
      `**Step 3:** Select your target node from the dropdown.\n\n` +
      `If DNS matches the selected node, SSL will auto-enable.`
    )
    .setFooter({ text: `${HOST_NAME} Proxy Manager` });

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

  if (interaction.commandName === "listproxy") {
    await db.read();
    const rows = (db.data.proxies || []).filter(p => p.userId === interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle("📜 Your Proxies")
      .setColor(0x5865f2)
      .setDescription(rows.length ? "Here’s what you have proxied:" : "No proxies found.")
      .setFooter({ text: "BonerHosting Proxy Manager" });

    if (rows.length) {
      embed.addFields({
        name: "Proxies",
        value: rows.map(p => `• **${p.domain}** → \`${p.forwardHost}:${p.forwardPort}\``).join("\n"),
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === "deleteproxy") {
    const domain = cleanDomain(interaction.options.getString("domain", true));
    await db.read();

    const idx = (db.data.proxies || []).findIndex(
      p => p.userId === interaction.user.id && p.domain === domain
    );

    if (idx === -1) {
      return interaction.reply({
        content: "❌ Not found under your account. Use `/listproxy`.",
        flags: MessageFlags.Ephemeral
      });
    }

    const entry = db.data.proxies[idx];
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await deleteProxyHost(entry.npmId);
    } catch {}

    db.data.proxies.splice(idx, 1);
    await db.write();

    console.log(
      `[PROXY DELETE] user=${interaction.user.tag} (${interaction.user.id}) domain=${domain} -> ${entry.forwardHost}:${entry.forwardPort}`
    );

    await sendProxyLog(interaction.client, "delete", {
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      domain,
      forwardHost: entry.forwardHost,
      forwardPort: entry.forwardPort,
      node: guessNodeFromIp(entry.forwardHost)
    });

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Proxy Deleted")
      .setColor(0xed4245)
      .addFields(
        { name: "Domain", value: `\`${domain}\``, inline: true },
        { name: "Target", value: `\`${entry.forwardHost}:${entry.forwardPort}\``, inline: true }
      )
      .setFooter({ text: "BonerHosting Proxy Manager" });

    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.commandName === "createproxy" || interaction.commandName === "editproxy") {
    const mode = interaction.commandName === "editproxy" ? "edit" : "create";
    const domain = cleanDomain(interaction.options.getString("domain", true));
    const forwardPort = interaction.options.getInteger("forwardport", true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (mode === "edit") {
      await db.read();
      const existing = (db.data.proxies || []).find(
        p => p.userId === interaction.user.id && p.domain === domain
      );
      if (!existing) {
        return interaction.editReply("❌ You don’t own that proxy. Use `/listproxy`.");
      }
    }

    const records = await resolveA(domain);

	const forwardHosts = getForwardHosts().map(h => h.ip);
	const dnsVerified = records.some(ip => forwardHosts.includes(ip));
    PENDING.set(makeKey(interaction.user.id, domain, forwardPort, mode), { dnsVerified });

    if (!dnsVerified) {
      const embed = new EmbedBuilder()
        .setTitle("⚠️ DNS Verification Skipped")
        .setColor(0xfee75c)
        .setDescription(
          `**Domain:** \`${domain}\`\n\n` +
            `**Resolved A records:** ${
              records.length ? records.map(x => `\`${x}\``).join(", ") : "`(none)`"
            }\n\n` +
            "Proceed with caution. SSL will NOT be auto-enabled unless DNS is correct.\n" +
            "Confirm to continue."
        )
        .setFooter({ text: "BonerHosting Proxy Manager" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(makeId(mode, "continue", interaction.user.id, forwardPort, domain))
          .setLabel("I Understand, Continue")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(makeId(mode, "cancel", interaction.user.id, forwardPort, domain))
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    return showForwardHostSelect(interaction, mode, domain, forwardPort);
  }
}


async function respondWith(interaction, payload) {
  if (interaction.isMessageComponent()) {
    return interaction.update(payload);
  }
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function showForwardHostSelect(interaction, mode, domain, forwardPort) {
  const embed = new EmbedBuilder()
    .setTitle(mode === "edit" ? "✏️ Edit Proxy — Select Forward Host" : "➕ Create Proxy — Select Forward Host")
    .setColor(0x5865f2)
    .addFields(
      { name: "Domain", value: `\`${domain}\``, inline: true },
      { name: "Forward Port", value: `\`${forwardPort}\``, inline: true }
    )
    .setFooter({ text: "BonerHosting Proxy Manager" });

  const hosts = getForwardHosts().slice(0, 25);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(makeId(mode, "pickhost", interaction.user.id, forwardPort, domain))
    .setPlaceholder("Select a Forward Host IP")
    .addOptions(
      hosts.map(h => ({
        label: h.label,
        value: h.ip,
        description: h.ip
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);
  return respondWith(interaction, { embeds: [embed], components: [row] });
}

async function handleButton(interaction) {
  const { mode, action, userId, port, domain } = parseId(interaction.customId);

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ This isn’t your prompt.", flags: MessageFlags.Ephemeral });
  }

  if (action === "cancel") {
    const embed = new EmbedBuilder()
      .setTitle("❌ Cancelled")
      .setDescription("Proxy wizard cancelled.")
      .setColor(0xed4245)
      .setFooter({ text: "BonerHosting Proxy Manager" });

    return interaction.update({ embeds: [embed], components: [] });
  }

  if (action === "continue") {
    return showForwardHostSelect(interaction, mode, domain, port);
  }
}

async function handleSelect(interaction) {
  const { mode, action, userId, port, domain } = parseId(interaction.customId);

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ This isn’t your prompt.", flags: MessageFlags.Ephemeral });
  }
  if (action !== "pickhost") return;

  const forwardHost = interaction.values[0];

  const working = new EmbedBuilder()
    .setTitle(mode === "edit" ? "🔄 Updating Proxy" : "🔄 Creating Proxy")
    .setColor(0xfee75c)
    .addFields(
      { name: "Domain", value: `\`${domain}\``, inline: true },
      { name: "Target", value: `\`${forwardHost}:${port}\``, inline: true }
    )
    .setFooter({ text: "BonerHosting Proxy Manager" });

  await interaction.update({ embeds: [working], components: [] });

  try {
    await db.read();
    db.data.proxies ||= [];

    const pending = PENDING.get(makeKey(userId, domain, port, mode)) || { dnsVerified: false };

    if (mode === "create") {
      const already = db.data.proxies.find(p => p.userId === userId && p.domain === domain);
      if (already) {
        return interaction.editReply({
          content: "❌ You already proxied that domain. Use `/editproxy` or `/deleteproxy`.",
          embeds: []
        });
      }

      const npmId = await createProxyHost(domain, forwardHost, port);

      let sslStatus = "⚠️ Not enabled (DNS not verified)";
      if (pending.dnsVerified) {
        try {
          const certId = await ensureLetsEncrypt(domain);
          await updateProxyHost(npmId, { certificate_id: certId, ssl_forced: true });
          sslStatus = "✅ Enabled (Let’s Encrypt)";
        } catch {
          sslStatus = "⚠️ Proxy created, SSL failed (check NPM logs)";
        }
      }

      db.data.proxies.push({
        userId,
        domain,
        forwardHost,
        forwardPort: port,
        npmId,
        createdAt: Date.now()
      });
      await db.write();

      console.log(
        `[PROXY CREATE] user=${interaction.user.tag} (${userId}) domain=${domain} -> ${forwardHost}:${port}`
      );

      await sendProxyLog(interaction.client, "create", {
        userId,
        userTag: interaction.user.tag,
        domain,
        forwardHost,
        forwardPort: port,
        node: guessNodeFromIp(forwardHost),
        ssl: sslStatus
      });

      const ok = new EmbedBuilder()
        .setTitle("✅ Proxy Created")
        .setColor(0x57f287)
        .addFields(
          { name: "Domain", value: `\`${domain}\``, inline: true },
          { name: "Target", value: `\`${forwardHost}:${port}\``, inline: true },
          { name: "SSL", value: sslStatus, inline: false }
        )
        .setFooter({ text: "BonerHosting Proxy Manager" });

      return interaction.editReply({ embeds: [ok], components: [] });
    }

    const entry = db.data.proxies.find(p => p.userId === userId && p.domain === domain);
    if (!entry) {
      return interaction.editReply({ content: "❌ You don’t own that proxy.", embeds: [] });
    }

    await updateProxyHost(entry.npmId, {
      forward_host: forwardHost,
      forward_port: Number(port)
    });

    let sslStatus = "⚠️ Not changed (DNS not verified)";
    if (pending.dnsVerified) {
      try {
        const certId = await ensureLetsEncrypt(domain);
        await updateProxyHost(entry.npmId, { certificate_id: certId, ssl_forced: true });
        sslStatus = "✅ Enabled / ensured";
      } catch {
        sslStatus = "⚠️ Proxy updated, SSL failed (check NPM logs)";
      }
    }

    entry.forwardHost = forwardHost;
    entry.forwardPort = port;
    entry.updatedAt = Date.now();
    await db.write();

    console.log(
      `[PROXY EDIT] user=${interaction.user.tag} (${userId}) domain=${domain} -> ${forwardHost}:${port}`
    );

    // ✅ embed log
    await sendProxyLog(interaction.client, "edit", {
      userId,
      userTag: interaction.user.tag,
      domain,
      forwardHost,
      forwardPort: port,
      node: guessNodeFromIp(forwardHost),
      ssl: sslStatus
    });

    const ok = new EmbedBuilder()
      .setTitle("✅ Proxy Updated")
      .setColor(0x57f287)
      .addFields(
        { name: "Domain", value: `\`${domain}\``, inline: true },
        { name: "Target", value: `\`${forwardHost}:${port}\``, inline: true },
        { name: "SSL", value: sslStatus, inline: false }
      )
      .setFooter({ text: "BonerHosting Proxy Manager" });

    return interaction.editReply({ embeds: [ok], components: [] });
  } catch (e) {
    console.error("proxy flow error:", e);

    const err = new EmbedBuilder()
      .setTitle("❌ Failed")
      .setColor(0xed4245)
      .setDescription("Something went wrong. Check your console logs.")
      .setFooter({ text: "BonerHosting Proxy Manager" });

    return interaction.editReply({ embeds: [err], components: [] });
  }
}
