import {
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
  baseURL: `${PTERO_URL}/api/client`,
  headers: {
    Authorization: `Bearer ${CLIENT_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Configure Axios for Application API (Nodes, Suspend, Delete)
const pteroApp = axios.create({
  baseURL: `${PTERO_URL}/api/application`,
  headers: {
    Authorization: `Bearer ${APP_API_KEY}`,
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
      const memUsage = `${attrs.allocated_resources.memory} / ${attrs.memory} MB`;
      const diskUsage = `${attrs.allocated_resources.disk} / ${attrs.disk} MB`;
      statusText += `🟢 **${attrs.name}**: (Memory: ${memUsage} | Disk: ${diskUsage})\\n`;
    });

    statusText += `\\n*Last Updated: <t:${Math.floor(Date.now() / 1000)}:R>*`;

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
    console.log(`New status message ID: ${statusMessageId}. Save this to STATUS_MESSAGE_ID if needed.`);
  } catch (error) {
    console.error('Error updating node status:', error);
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  // Update node status every 3 minutes (180,000 ms)
  setInterval(updateNodeStatus, 180000);
  updateNodeStatus();
});

// ==========================================
// DISCORD INTERACTIONS
// ==========================================
client.on('interactionCreate', async (interaction: Interaction<CacheType>) => {
  // 1. COMMAND: Show control panel dropdown
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    await interaction.deferReply({ ephemeral: true });
    try {
      // Get user servers from Client API
      const res = await pteroClient.get('/');
      const servers = res.data.data;

      if (servers.length === 0) {
        return interaction.editReply('You do not have any servers assigned to this account.');
      }

      const options = servers.slice(0, 25).map((srv: any) => ({
        label: srv.attributes.name.substring(0, 50),
        description: `Memory: ${srv.attributes.limits.memory}MB | CPU: ${srv.attributes.limits.cpu}%`,
        // We pack BOTH identifier (client API) and internal_id (application API) inside value
        value: `${srv.attributes.identifier}_${srv.attributes.internal_id}`,
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId('select_server_dropdown')
        .setPlaceholder('Select your server to manage')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

      await interaction.editReply({
        content: '**ETALEMC HOSTING**\\nPlease select your server below:',
        components: [row],
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply('Failed to fetch your servers. Check API credentials.');
    }
    return;
  }

  // 2. SELECT MENU: Render server management control buttons
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_server_dropdown') {
    const [identifier, internalId] = interaction.values[0].split('_');

    const startBtn = new ButtonBuilder().setCustomId(`ptero_start_${identifier}_${internalId}`).setLabel('Start').setStyle(ButtonStyle.Success);
    const stopBtn = new ButtonBuilder().setCustomId(`ptero_stop_${identifier}_${internalId}`).setLabel('Stop').setStyle(ButtonStyle.Danger);
    const restartBtn = new ButtonBuilder().setCustomId(`ptero_restart_${identifier}_${internalId}`).setLabel('Restart').setStyle(ButtonStyle.Primary);
    const reinstallBtn = new ButtonBuilder().setCustomId(`ptero_reinstall_${identifier}_${internalId}`).setLabel('Reinstall').setStyle(ButtonStyle.Secondary);
    const deleteBtn = new ButtonBuilder().setCustomId(`ptero_delete_${identifier}_${internalId}`).setLabel('Delete').setStyle(ButtonStyle.Danger);
    const suspendBtn = new ButtonBuilder().setCustomId(`ptero_suspend_${identifier}_${internalId}`).setLabel('Suspend (Admin)').setStyle(ButtonStyle.Danger);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(startBtn, stopBtn, restartBtn, reinstallBtn);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteBtn, suspendBtn);

    await interaction.update({
      content: `**ETALEMC HOSTING Panel**\\nCurrently Managing Server: \`${identifier}\``,
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
        await pteroClient.post(`/servers/${identifier}/power`, { signal });
        await interaction.editReply(`Power signal \`${action.toUpperCase()}\` has been sent to server \`${identifier}\`.`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(`Failed to ${action} server \`${identifier}\`.`);
      }
    }

    // REINSTALL
    if (action === 'reinstall') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await pteroClient.post(`/servers/${identifier}/settings/reinstall`);
        await interaction.editReply(`Server \`${identifier}\` is being reinstalled.`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(`Failed to trigger reinstall for \`${identifier}\`.`);
      }
    }

    // DELETE
    if (action === 'delete') {
      await interaction.deferReply({ ephemeral: true });
      try {
        // App API is required to delete the server completely using the internal ID.
        await pteroApp.delete(`/servers/${internalId}`);
        await interaction.editReply(`Server \`${identifier}\` has been deleted successfully.`);
      } catch (error) {
        console.error(error);
        await interaction.editReply(`Failed to delete server \`${identifier}\`. Make sure Application API keys are valid.`);
      }
    }

    // SUSPEND (Admin Only) -> Opens Modal
    if (action === 'suspend') {
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      if (!member?.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '⛔ Only administrators can suspend servers.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_suspend_${internalId}`)
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
      await pteroApp.post(`/servers/${internalId}/suspend`);
      
      // Ideally here you save the unsuspend date in a database (e.g., MongoDB, SQLite):
      // db.suspensions.insert({ serverId: internalId, unsuspendAt: Date.now() + days * 86400000 });
      // A background interval/cron job would check the DB and unsuspend when the time comes.

      await interaction.editReply(`✅ Server successfully suspended.\\n*Note: It will be suspended for ${days} days.* (Make sure a database cron job is configured to reverse this)`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('Failed to suspend server. Check Application API credentials.');
    }
    return;
  }
});

client.login(DISCORD_TOKEN);
