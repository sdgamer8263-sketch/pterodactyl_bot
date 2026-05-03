import { Copy, Code2, Coins, Bot, Terminal, Server, Package, List } from 'lucide-react';
import React, { useState } from 'react';

const managementBotCode = `import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextChannel,
  Interaction,
  CacheType,
  Message,
} from 'discord.js';
import axios from 'axios';

// ==========================================
// CONFIGURATION
// ==========================================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const PTERO_URL = process.env.PTERO_URL || 'https://panel.yourdomain.com';
const CLIENT_API_KEY = process.env.PTERO_CLIENT_KEY || 'ptlc_...';
const APP_API_KEY = process.env.PTERO_APP_KEY || 'ptla_...';
const ADMIN_ROLE_ID = '123456789012345678'; // Replace with Admin Role ID
const STATUS_CHANNEL_ID = '123456789012345678'; // Channel ID for Node Status
let statusMessageId: string | null = process.env.STATUS_MESSAGE_ID || null; // Will create via bot if empty

// Initialize Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Configure Axios for Client API (Power Actions, Reinstall)
const pteroClient = axios.create({
  baseURL: \`\${PTERO_URL}/api/client\`,
  headers: {
    Authorization: \`Bearer \${CLIENT_API_KEY}\`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Configure Axios for Application API (Nodes, Suspend, Delete)
const pteroApp = axios.create({
  baseURL: \`\${PTERO_URL}/api/application\`,
  headers: {
    Authorization: \`Bearer \${APP_API_KEY}\`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ==========================================
// FEATURE 4: AUTO-UPDATING NODE STATUS
// ==========================================
async function updateNodeStatus() {
  try {
    const channel = (await client.channels.fetch(STATUS_CHANNEL_ID)) as TextChannel;
    if (!channel) return;

    // Fetch nodes from Application API
    const res = await pteroApp.get('/nodes?include=allocations,servers');
    const nodes = res.data.data;

    let statusText = '**ETALEMC HOSTING - Real-Time Node Status**\\n\\n';
    
    nodes.forEach((node: any) => {
      const attrs = node.attributes;
      const memUsage = \`\${attrs.allocated_resources.memory} / \${attrs.memory} MB\`;
      const diskUsage = \`\${attrs.allocated_resources.disk} / \${attrs.disk} MB\`;
      statusText += \`🟢 **\${attrs.name}**: (Memory: \${memUsage} | Disk: \${diskUsage})\\n\`;
    });

    statusText += \`\\n*Last Updated: <t:\${Math.floor(Date.now() / 1000)}:R>*\`;

    if (statusMessageId) {
      const msg = await channel.messages.fetch(statusMessageId).catch(() => null);
      if (msg) {
        await msg.edit(statusText);
        return; // Successfully edited
      }
    }

    // Drop back to sending a new message if it doesn't exist
    const newMsg = await channel.send(statusText);
    statusMessageId = newMsg.id;
    console.log(\`New status message ID: \${statusMessageId}. Save this to STATUS_MESSAGE_ID if needed.\`);
  } catch (error) {
    console.error('Error updating node status:', error);
  }
}

client.once('ready', () => {
  console.log(\`Logged in as \${client.user?.tag}\`);
  // Update node status every 3 minutes (180,000 ms)
  setInterval(updateNodeStatus, 180000);
  updateNodeStatus();
});

// ==========================================
// DISCORD INTERACTIONS & COMMANDS
// ==========================================
client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // 1. COMMAND: !panel
  if (command === 'panel') {
    try {
      // Get user servers from Client API
      const res = await pteroClient.get('/');
      const servers = res.data.data;

      if (servers.length === 0) {
        return message.reply('You do not have any servers assigned to this account.');
      }

      const options = servers.slice(0, 25).map((srv: any) => ({
        label: srv.attributes.name.substring(0, 50),
        description: \`Memory: \${srv.attributes.limits.memory}MB | CPU: \${srv.attributes.limits.cpu}%\`,
        value: \`\${srv.attributes.identifier}_\${srv.attributes.internal_id}\`,
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_server_dropdown')
        .setPlaceholder('Select your server to manage')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

      await message.reply({
        content: '**ETALEMC HOSTING**\\nPlease select your server below:',
        components: [row],
      });
    } catch (error) {
      console.error(error);
      await message.reply('Failed to fetch your servers. Check API credentials.');
    }
  }
});

client.on('interactionCreate', async (interaction: Interaction<CacheType>) => {
  // 2. SELECT MENU: Render server management control buttons
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_server_dropdown') {
    const [identifier, internalId] = interaction.values[0].split('_');

    const startBtn = new ButtonBuilder().setCustomId(\`ptero_start_\${identifier}_\${internalId}\`).setLabel('Start').setStyle(ButtonStyle.Success);
    const stopBtn = new ButtonBuilder().setCustomId(\`ptero_stop_\${identifier}_\${internalId}\`).setLabel('Stop').setStyle(ButtonStyle.Danger);
    const restartBtn = new ButtonBuilder().setCustomId(\`ptero_restart_\${identifier}_\${internalId}\`).setLabel('Restart').setStyle(ButtonStyle.Primary);
    const reinstallBtn = new ButtonBuilder().setCustomId(\`ptero_reinstall_\${identifier}_\${internalId}\`).setLabel('Reinstall').setStyle(ButtonStyle.Secondary);
    const deleteBtn = new ButtonBuilder().setCustomId(\`ptero_delete_\${identifier}_\${internalId}\`).setLabel('Delete').setStyle(ButtonStyle.Danger);
    const suspendBtn = new ButtonBuilder().setCustomId(\`ptero_suspend_\${identifier}_\${internalId}\`).setLabel('Suspend (Admin)').setStyle(ButtonStyle.Danger);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(startBtn, stopBtn, restartBtn, reinstallBtn);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteBtn, suspendBtn);

    await interaction.update({
      content: \`**ETALEMC HOSTING Panel**\\nCurrently Managing Server: \\\`\${identifier}\\\`\`,
      components: [row1, row2],
    });
    return;
  }

  // 3. BUTTONS: Handle server actions
  if (interaction.isButton() && interaction.customId.startsWith('ptero_')) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const identifier = parts[2]; // Used in Client API
    const internalId = parts[3]; // Used in Application API

    // START / STOP / RESTART
    if (['start', 'stop', 'restart'].includes(action)) {
      await interaction.deferReply({ ephemeral: true });
      try {
        const signal = action === 'stop' ? 'kill' : action; // Pterodactyl uses 'kill' or 'stop'
        await pteroClient.post(\`/servers/\${identifier}/power\`, { signal });
        await interaction.editReply(\`Power signal \\\`\${action.toUpperCase()}\\\` has been sent to server \\\`\${identifier}\\\`.\`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(\`Failed to \${action} server \\\`\${identifier}\\\`.\`);
      }
    }

    // REINSTALL
    if (action === 'reinstall') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await pteroClient.post(\`/servers/\${identifier}/settings/reinstall\`);
        await interaction.editReply(\`Server \\\`\${identifier}\\\` is being reinstalled.\`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(\`Failed to trigger reinstall for \\\`\${identifier}\\\`.\`);
      }
    }

    // DELETE
    if (action === 'delete') {
      await interaction.deferReply({ ephemeral: true });
      try {
        // App API is required to delete the server completely using the internal ID.
        await pteroApp.delete(\`/servers/\${internalId}\`);
        await interaction.editReply(\`Server \\\`\${identifier}\\\` has been deleted successfully.\`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(\`Failed to delete server \\\`\${identifier}\\\`. Make sure Application API keys are valid.\`);
      }
    }

    // SUSPEND (Admin Only) -> Opens Modal
    if (action === 'suspend') {
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      if (!member?.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '⛔ Only administrators can suspend servers.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(\`modal_suspend_\${internalId}\`)
        .setTitle('Suspend Server');

      const daysInput = new TextInputBuilder()
        .setCustomId('suspend_days')
        .setLabel('How many days to suspend? (e.g. 7)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(daysInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    }
    return;
  }

  // 4. MODALS: Handle Suspend timeframe submission
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_suspend_')) {
    const internalId = interaction.customId.replace('modal_suspend_', '');
    const daysStr = interaction.fields.getTextInputValue('suspend_days');
    const days = parseInt(daysStr, 10);

    if (isNaN(days) || days <= 0) {
      return interaction.reply({ content: 'Please provide a valid number of days.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      // Suspend via Application API
      await pteroApp.post(\`/servers/\${internalId}/suspend\`);
      
      // Ideally here you save the unsuspend date in a database (e.g., MongoDB, SQLite):
      // db.suspensions.insert({ serverId: internalId, unsuspendAt: Date.now() + days * 86400000 });
      // A background interval/cron job would check the DB and unsuspend when the time comes.

      await interaction.editReply(\`✅ Server successfully suspended.\\n*Note: It will be suspended for \${days} days.* (Make sure a database cron job is configured to reverse this)\`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('Failed to suspend server. Check Application API credentials.');
    }
    return;
  }
});

client.login(DISCORD_TOKEN);
`;

const economyBotCode = `import { Client, GatewayIntentBits, Message } from 'discord.js';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const PREFIX = '!';

let db: Database;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================
async function initializeDatabase() {
  db = await open({
    filename: './economy.db',
    driver: sqlite3.Database
  });

  await db.exec(\`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      wallet INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      lastDaily INTEGER DEFAULT 0,
      lastWork INTEGER DEFAULT 0,
      lastRob INTEGER DEFAULT 0
    )
  \`);
}

async function getUser(userId: string) {
  let user = await db.get('SELECT * FROM users WHERE userId = ?', [userId]);
  if (!user) {
    await db.run('INSERT INTO users (userId) VALUES (?)', [userId]);
    user = { userId, wallet: 0, bank: 0, lastDaily: 0, lastWork: 0, lastRob: 0 };
  }
  return user;
}

client.once('ready', async () => {
  await initializeDatabase();
  console.log(\`Economy module active as \${client.user?.tag}\`);
});

// ==========================================
// COMMAND HANDLING
// ==========================================
client.on('messageCreate', async (message: Message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  const user = await getUser(message.author.id);
  const now = Date.now();

  // COMMAND 1: !daily (50 coins, 24hr cooldown)
  if (command === 'daily') {
    const cooldownInfo = 24 * 60 * 60 * 1000;
    if (now - user.lastDaily < cooldownInfo) {
      const remainingHours = ((cooldownInfo - (now - user.lastDaily)) / (1000 * 60 * 60)).toFixed(1);
      return message.reply(\`⏰ You have already collected your daily reward! Please wait **\${remainingHours} hours**.\`);
    }

    await db.run('UPDATE users SET wallet = wallet + 50, lastDaily = ? WHERE userId = ?', [now, message.author.id]);
    return message.reply('🎉 You collected your daily reward of **50 coins**!');
  }

  // COMMAND 2: !work (random coins, 30m cooldown)
  if (command === 'work') {
    const cooldownInfo = 30 * 60 * 1000;
    if (now - user.lastWork < cooldownInfo) {
      const remainingMinutes = ((cooldownInfo - (now - user.lastWork)) / (1000 * 60)).toFixed(1);
      return message.reply(\`⏰ You are too tired to work! Please wait **\${remainingMinutes} minutes**.\`);
    }

    const earned = Math.floor(Math.random() * 41) + 10; // Earn between 10 and 50 coins
    await db.run('UPDATE users SET wallet = wallet + ?, lastWork = ? WHERE userId = ?', [earned, now, message.author.id]);
    return message.reply(\`💼 You worked hard and earned **\${earned} coins**!\`);
  }

  // COMMAND 3: !set-coin @user <amount> (Admin only)
  if (command === 'set-coin') {
    const member = message.member;
    if (!member?.permissions.has('Administrator')) {
      return message.reply('⛔ You do not have permission to use this command.');
    }

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target || isNaN(amount) || amount < 0) {
      return message.reply(\`Usage: \\\`\${PREFIX}set-coin @user <amount>\\\`\`);
    }

    await getUser(target.id); // Ensure user is in database
    await db.run('UPDATE users SET wallet = ? WHERE userId = ?', [amount, target.id]);
    return message.reply(\`✅ Set **\${target.username}**'s wallet to **\${amount} coins**.\`);
  }

  // BAL COMMAND: Check Balance Helper
  if (command === 'bal' || command === 'balance') {
     return message.reply(\`💳 **Wallet:** \${user.wallet} coins \\n🏦 **Bank:** \${user.bank} coins\`);
  }

  // COMMAND 4: Bank !deposit & !withdraw (1 coin exact fee)
  if (command === 'deposit' || command === 'withdraw') {
    const amountStr = args[0];
    let amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) {
      if (amountStr === 'all') {
         amount = command === 'deposit' ? user.wallet : user.bank;
      } else {
         return message.reply(\`Usage: \\\`\${PREFIX}\${command} <amount|all>\\\`\`);
      }
    }

    const fee = 1;

    if (command === 'deposit') {
      if (user.wallet < fee) return message.reply('❌ You do not have enough coins in your wallet to cover the 1 coin transaction fee.');
      if (user.wallet < amount) amount = user.wallet; 
      if (amount <= fee) return message.reply('❌ Deposit amount must be greater than the 1 coin fee.');

      const depositAmount = amount - fee;
      await db.run('UPDATE users SET wallet = wallet - ?, bank = bank + ? WHERE userId = ?', [amount, depositAmount, message.author.id]);
      return message.reply(\`🏦 Deposited **\${depositAmount} coins** into your bank (1 coin fee deducted). Total spent from wallet: \${amount}.\`);
    
    } else { // withdraw
      if (user.bank === 0) return message.reply('❌ Your bank is empty.');
      if (user.bank < amount) amount = user.bank;
      if (amount <= fee) return message.reply('❌ Withdrawal amount from the bank must be greater than the 1 coin fee.');

      const withdrawAmount = amount - fee;
      await db.run('UPDATE users SET bank = bank - ?, wallet = wallet + ? WHERE userId = ?', [amount, withdrawAmount, message.author.id]);
      return message.reply(\`🏦 Withdrew **\${withdrawAmount} coins** to your wallet (1 coin fee deducted). Total removed from bank: \${amount}.\`);
    }
  }

  // COMMAND 5: !rob @user (30m cooldown)
  if (command === 'rob') {
    const cooldownInfo = 30 * 60 * 1000;
    if (now - user.lastRob < cooldownInfo) {
      const remainingMinutes = ((cooldownInfo - (now - user.lastRob)) / (1000 * 60)).toFixed(1);
      return message.reply(\`⏰ You are laying low from the cops. Wait **\${remainingMinutes} minutes** before robbing again.\`);
    }

    const target = message.mentions.users.first();
    if (!target) return message.reply(\`Usage: \\\`\${PREFIX}rob @user\\\`\`);
    if (target.id === message.author.id) return message.reply('❌ You cannot rob yourself.');

    const targetData = await getUser(target.id);
    if (targetData.wallet < 20) {
      return message.reply(\`❌ **\${target.username}** doesn't have enough coins worth stealing (requires at least 20 in wallet).\`);
    }

    // 50% chance to steal | 25% chance of being caught | 25% chance of failure
    const chance = Math.random();

    if (chance > 0.5) {
      // Steal 10% to 30% of target's wallet
      const stealPercentage = Math.random() * 0.2 + 0.1;
      const amountStolen = Math.floor(targetData.wallet * stealPercentage);
      
      await db.run('UPDATE users SET wallet = wallet + ?, lastRob = ? WHERE userId = ?', [amountStolen, now, message.author.id]);
      await db.run('UPDATE users SET wallet = wallet - ? WHERE userId = ?', [amountStolen, target.id]);

      return message.reply(\`🥷 💰 Success! You successfully robbed **\${target.username}** and got away with **\${amountStolen} coins**!\`);
    } else if (chance > 0.25) {
      // Caught by police - lose 20 coins
      const penalty = 20;
      await db.run('UPDATE users SET wallet = MAX(0, wallet - ?), lastRob = ? WHERE userId = ?', [penalty, now, message.author.id]);
      return message.reply(\`🚓 🚨 You were caught by the police trying to rob **\${target.username}**! You paid a fine of **\${penalty} coins**.\`);
    } else {
      // Complete failure
      await db.run('UPDATE users SET lastRob = ? WHERE userId = ?', [now, message.author.id]);
      return message.reply(\`❌ You tried to rob **\${target.username}** but tripped along the way and they escaped!\`);
    }
  }

  // COMMAND 6: Minigame !cointoss <head|tail> <bet>
  if (command === 'cointoss') {
    const choice = args[0]?.toLowerCase();
    const bet = parseInt(args[1]);

    if (!['head', 'heads', 'tail', 'tails'].includes(choice) || isNaN(bet) || bet <= 0) {
      return message.reply(\`Usage: \\\`\${PREFIX}cointoss <head|tail> <amount>\\\`\`);
    }

    if (user.wallet < bet) {
      return message.reply(\`❌ You only have **\${user.wallet} coins** in your wallet.\`);
    }

    const sideChosen = (choice === 'head' || choice === 'heads') ? 'heads' : 'tails';
    const result = Math.random() > 0.5 ? 'heads' : 'tails';

    if (sideChosen === result) {
      await db.run('UPDATE users SET wallet = wallet + ? WHERE userId = ?', [bet, message.author.id]);
      return message.reply(\`🪙 The coin landed on **\${result}**! You won **\${bet} coins**!\`);
    } else {
      await db.run('UPDATE users SET wallet = wallet - ? WHERE userId = ?', [bet, message.author.id]);
      return message.reply(\`🪙 The coin landed on **\${result}**. You lost your bet of **\${bet} coins**.\`);
    }
  }
});

client.login(DISCORD_TOKEN);
`;

const featuresBotCode = `import {
  Client,
  GatewayIntentBits,
  Message,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { GoogleGenAI } from '@google/genai';

// ==========================================
// CONFIGURATION
// ==========================================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';
const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID || '123456789012345678';
const REVIEW_LOG_CHANNEL_ID = process.env.REVIEW_LOG_CHANNEL_ID || '123456789012345678';
const PREFIX = '!';

let aiChatEnabled = true;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

client.once('ready', () => {
  console.log(\`Features module active as \${client.user?.tag}\`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  // ==========================================
  // 1. AI CHAT TOGGLE (Admin Only)
  // ==========================================
  if (message.content.startsWith(\`\${PREFIX}toggleai\`)) {
    if (!message.member?.permissions.has('Administrator')) {
      return message.reply('⛔ You do not have permission to use this command.');
    }
    aiChatEnabled = !aiChatEnabled;
    return message.reply(\`🤖 AI Chat is now **\${aiChatEnabled ? 'ON' : 'OFF'}**.\`);
  }

  // ==========================================
  // 2. AI CHAT RESPONSE
  // ==========================================
  if (
    message.channelId === AI_CHANNEL_ID &&
    aiChatEnabled &&
    !message.content.startsWith(PREFIX)
  ) {
    await message.channel.sendTyping();
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message.content,
        config: {
          systemInstruction: 'You are a helpful, friendly assistant for ETALEMC HOSTING. Keep responses concise.',
        },
      });
      const replyText = response.text || "I'm not sure what to say.";
      return message.reply(replyText);
    } catch (error) {
      console.error('Gemini API Error:', error);
      return message.reply('⚠️ Sorry, my AI brain encountered an error.');
    }
  }

  // ==========================================
  // HELP COMMAND
  // ==========================================
  if (message.content.trim() === \`\${PREFIX}help\`) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📚 ETALEMC HOSTING - Commands Help')
      .setDescription('Here are all the available commands for the bot:')
      .addFields(
        { name: '🛠️ Management', value: '\`!panel\` - Opens the server management panel', inline: false },
        { name: '🪙 Economy', value: '\`!daily\` - Collect daily reward\\n\`!work\` - Work for some coins\\n\`!bal\` / \`!balance\` - Check your balance\\n\`!deposit <amount>\` - Deposit coins into bank\\n\`!withdraw <amount>\` - Withdraw coins from bank\\n\`!rob @user\` - Steal coins from another user\\n\`!cointoss <head|tail> <bet>\` - Bet coins on a coin toss\\n\`!set-coin @user <amount>\` - (Admin) Set a user\\'s wallet balance', inline: false },
        { name: '✨ Features', value: '\`!help\` - Shows this help menu\\n\`!review <message>\` - Post a customer review\\n\`!toggleai\` - (Admin) Turn AI features on/off', inline: false }
      )
      .setFooter({ text: 'Prefix is ! for all commands' })
      .setTimestamp();
      
    return message.reply({ embeds: [embed] });
  }

  // ==========================================
  // 3. REVIEW SYSTEM
  // ==========================================
  if (message.content.startsWith(\`\${PREFIX}review \`)) {
    const reviewText = message.content.slice(\`\${PREFIX}review\`.length).trim();

    if (!reviewText) {
      return message.reply(\`Usage: \\\`\${PREFIX}review <your message>\\\`\`);
    }

    const reviewChannel = client.channels.cache.get(REVIEW_LOG_CHANNEL_ID) as TextChannel;
    if (!reviewChannel) {
      return message.reply('⚠️ The review log channel is not configured correctly.');
    }

    const embed = new EmbedBuilder()
      .setColor('#fbbf24') // Amber/Gold color for reviews
      .setTitle('🌟 New Customer Review')
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL() || undefined,
      })
      .setDescription(reviewText)
      .setTimestamp()
      .setFooter({ text: 'ETALEMC HOSTING' });

    try {
      await reviewChannel.send({ embeds: [embed] });
      return message.reply('✅ Thank you for your review! It has been posted successfully.');
    } catch (error) {
      console.error('Failed to send review:', error);
      return message.reply('⚠️ Failed to post the review. Check bot channel permissions.');
    }
  }
});

client.login(DISCORD_TOKEN);
`;

const dashboardServerCode = `import express from 'express';
import axios from 'axios';

// ==========================================
// CONFIGURATION
// ==========================================
const PORT = process.env.PORT || 3000;
const PTERO_URL = process.env.PTERO_URL || 'https://panel.yourdomain.com';
const APP_API_KEY = process.env.PTERO_APP_KEY || 'ptla_...';

const pteroApp = axios.create({
  baseURL: \`\${PTERO_URL}/api/application\`,
  headers: {
    Authorization: \`Bearer \${APP_API_KEY}\`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

const app = express();

// ==========================================
// HTML TEMPLATE
// ==========================================
const htmlTemplate = (nodesData: any) => \`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ETALEMC HOSTING - Node Status</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; }
        .glass-panel { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        .status-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    </style>
</head>
<body class="min-h-screen p-4 sm:p-8">
    <div class="max-w-6xl mx-auto">
        <header class="flex flex-col sm:flex-row justify-between items-center mb-10 pb-6 border-b border-slate-700">
            <div>
                <h1 class="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 gap-2 flex items-center">
                    <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    ETALEMC HOSTING
                </h1>
                <p class="text-slate-400 mt-1">Real-time infrastructure status</p>
            </div>
            <div class="mt-4 sm:mt-0 flex items-center gap-3">
                <span class="flex h-3 w-3 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span class="text-emerald-400 font-medium">All Systems Operational</span>
            </div>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            \${nodesData.map((node: any) => {
                const attrs = node.attributes;
                const memPercent = Math.round((attrs.allocated_resources.memory / attrs.memory) * 100);
                const diskPercent = Math.round((attrs.allocated_resources.disk / attrs.disk) * 100);
                return \`
                <div class="glass-panel rounded-xl p-6 shadow-lg hover:shadow-indigo-500/10 transition-all duration-300">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h2 class="text-xl font-semibold text-white flex items-center gap-2">
                                <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>
                                \${attrs.name}
                            </h2>
                            <p class="text-sm text-slate-400 mt-1">\${attrs.fqdn}</p>
                        </div>
                        <div class="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 status-pulse"></span>
                            ONLINE
                        </div>
                    </div>
                    
                    <div class="space-y-4 mt-6">
                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-slate-300">Memory Usage</span>
                                <span class="text-slate-100 font-medium">\${attrs.allocated_resources.memory} / \${attrs.memory} MB</span>
                            </div>
                            <div class="w-full bg-slate-700 rounded-full h-2">
                                <div class="bg-indigo-500 h-2 rounded-full" style="width: \${memPercent}%"></div>
                            </div>
                        </div>

                        <div>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-slate-300">Disk Usage</span>
                                <span class="text-slate-100 font-medium">\${attrs.allocated_resources.disk} / \${attrs.disk} MB</span>
                            </div>
                            <div class="w-full bg-slate-700 rounded-full h-2">
                                <div class="bg-blue-500 h-2 rounded-full" style="width: \${diskPercent}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                \`;
            }).join('')}
        </div>
        
        <footer class="mt-12 text-center text-slate-500 text-sm pb-8">
            <p>&copy; \${new Date().getFullYear()} ETALEMC HOSTING. Automatic page refresh every 60 seconds.</p>
        </footer>
    </div>
    <script>
        setTimeout(() => window.location.reload(), 60000); // Auto-refresh every 60s
    </script>
</body>
</html>
\`;

// ==========================================
// ROUTES
// ==========================================
app.get('/', async (req, res) => {
  try {
    const response = await pteroApp.get('/nodes?include=allocations,servers');
    const nodesData = response.data.data;
    
    res.send(htmlTemplate(nodesData));
  } catch (error) {
    console.error('Failed to fetch nodes:', error);
    res.status(500).send(\`
      <div style="color: white; background: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif;">
          <h1>500 - Internal Server Error (Pterodactyl API Unreachable)</h1>
      </div>
    \`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`Dashboard Server running on port \${PORT}\`);
});
`;

const packageJsonCode = `{
  "name": "etalemc-hosting-bot",
  "version": "1.0.0",
  "description": "ETALEMC HOSTING Bot & Dashboard",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "axios": "^1.6.5",
    "@google/genai": "^0.1.2",
    "sqlite": "^5.1.1",
    "sqlite3": "^5.1.7",
    "express": "^4.18.2",
    "dotenv": "^16.4.1"
  }
}`;

const setupInstructionsCode = `# Step-by-Step Installation Guide for ETALEMC HOSTING Bot on VPS

# 1. Update your system packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js (v18 recommended for discord.js v14)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
// Alternatively, if you need to install git, curl, or unzip:
sudo apt install -y git curl unzip sqlite3

# 3. Clone the official GitHub repository
git clone https://github.com/sdgamer8263-sketch/pterodactyl_bot.git
cd pterodactyl_bot

# 4. Create package.json and install.sh
# You need to create both package.json and install.sh on your VPS.
# - Copy the contents from the "package.json" tab and save it as package.json:
#   nano package.json (Paste, then press Ctrl+X, Y, Enter)
# - Copy the contents from the "install.sh" tab and save it as install.sh:
#   nano install.sh (Paste, then press Ctrl+X, Y, Enter)

# 5. Install all dependencies
npm install

# 6. Make the installation script executable
chmod +x install.sh

# 7. Run the installation script
./install.sh

# 8. (Alternative) Run the bot directly using PM2 (to keep it online 24/7)
sudo npm install -g pm2
pm2 start index.js --name "etalemc-bot"
pm2 save
pm2 startup
`;

const installScriptCode = `#!/bin/bash
# install.sh
echo "Installing ETALEMC HOSTING bot..."
echo "Please make sure you have cloned the repo."
`;

const eggJsonCode = `{
  "name": "Pterodactyl Egg",
  "description": "Custom egg for the bot"
}`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'management' | 'economy' | 'features' | 'dashboard' | 'installer' | 'egg' | 'package' | 'setup'>('management');
  const [copied, setCopied] = useState(false);

  const activeCode = 
    activeTab === 'management' ? managementBotCode : 
    activeTab === 'economy' ? economyBotCode : 
    activeTab === 'features' ? featuresBotCode :
    activeTab === 'dashboard' ? dashboardServerCode :
    activeTab === 'installer' ? installScriptCode :
    activeTab === 'egg' ? eggJsonCode :
    activeTab === 'package' ? packageJsonCode :
    setupInstructionsCode;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-indigo-900">ETALEMC HOSTING System Config</h1>
          <p className="text-lg text-gray-600">
            This workspace contains all generated code and configurations for your platform.
            Toggle panels to access the <strong>Bot Modules</strong>, <strong>Dashboard Server</strong>, <strong>Auto-Installer</strong>, and <strong>Pterodactyl Egg</strong>.
          </p>
        </header>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          {/* Navigation Tabs */}
          <div className="flex flex-wrap border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab('management')}
              className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'management'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Code2 size={16} />
              Management
            </button>
            <button
               onClick={() => setActiveTab('economy')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'economy'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Coins size={16} />
              Economy
            </button>
            <button
               onClick={() => setActiveTab('features')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'features'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Bot size={16} />
              AI & Features
            </button>
            <button
               onClick={() => setActiveTab('dashboard')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'dashboard'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Copy size={16} />
              Web Dashboard
            </button>
            <button
               onClick={() => setActiveTab('installer')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'installer'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Terminal size={16} />
              Auto Installer
            </button>
            <button
               onClick={() => setActiveTab('egg')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'egg'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Server size={16} />
              Ptero Egg
            </button>
            <button
               onClick={() => setActiveTab('package')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'package'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <Package size={16} />
              package.json
            </button>
            <button
               onClick={() => setActiveTab('setup')}
               className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-medium transition-colors ${
                 activeTab === 'setup'
                   ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/50'
                   : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
               }`}
            >
              <List size={16} />
              Setup Info
            </button>
          </div>

          <div className="bg-gray-100 flex justify-between items-center px-4 py-3 border-b border-gray-200">
             <span className="font-mono text-sm text-gray-600 font-semibold">
               {activeTab === 'management' ? 'ETALEMC_Management.ts' : 
                activeTab === 'economy' ? 'ETALEMC_Economy.ts' : 
                activeTab === 'features' ? 'ETALEMC_Features.ts' :
                activeTab === 'dashboard' ? 'server.ts' :
                activeTab === 'installer' ? 'install.sh' :
                activeTab === 'egg' ? 'egg.json' :
                activeTab === 'package' ? 'package.json' :
                'setup_commands.sh'}
             </span>
             <button
               onClick={copyToClipboard}
               className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
             >
               <Copy size={16} />
               {copied ? 'Copied!' : 'Copy Code'}
             </button>
          </div>
          
          <div className="p-4 bg-gray-900 overflow-auto max-h-[600px] w-full">
             <pre className="text-sm font-mono leading-relaxed text-gray-100 whitespace-pre-wrap word-break">
               <code>{activeCode}</code>
             </pre>
          </div>
        </section>
        
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Next Steps & Deployment</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            <li><strong>Auto-Installer:</strong> Save the script as <code>install.sh</code>, make it executable (<code>chmod +x install.sh</code>), and run it (<code>./install.sh</code>). It will fetch the repo and prompt for variables.</li>
            <li><strong>Pterodactyl Egg:</strong> Import the <code>egg.json</code> into your Pterodactyl admin panel, which sets up the needed environment factors and Node.js 18.</li>
            <li>For the Discord features, ensure you have <code>discord.js axios sqlite3 sqlite @google/genai express</code> installed if installing manually.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

