const fs = require('fs');
const path = require('path');
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    InteractionContextType,
    PermissionsBitField,
    SlashCommandBuilder,
    REST,
    Routes,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { RconClient } = require('@0x0c/rcon');

const configPath = process.env.CONFIG_PATH || path.join('/data', 'config.json');

let config = {
    restartFeatureEnabled: true,
    rconFeatureEnabled: true,
    rateLimit: 12, // in minutes
    restartAccessRoleId: 'disabled',
    webhookUrl: null,
    initialDelay: 180000, // 3 minutes in milliseconds
    maxDuration: 720000,  // 12 minutes in milliseconds
    pollInterval: 20000    // 20 seconds in milliseconds
};

// Function to persist the config object to the file
function saveConfig() {
    try {
        // Ensure the directory exists before saving the file
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    } catch (error) {
        console.error('Error saving config file:', error);
    }
}

// Load the configuration file if it exists; otherwise, create it.
if (fs.existsSync(configPath)) {
    try {
        const fileData = fs.readFileSync(configPath);
        const fileConfig = JSON.parse(fileData);
        // Merge defaults with file values (file values take precedence)
        config = { ...config, ...fileConfig };
    } catch (error) {
        console.error('Error reading config file, using defaults.', error);
    }
} else {
    saveConfig();
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

/**
 * Polls the RCON port by sending the "help" command until a valid response is received.
 * If the silent flag is true, it uses the provided interaction object to send ephemeral follow-ups.
 */
async function pollServer(userId, channel, silent = false, interactionForFollowUp = null) {
    const initialDelay = config.initialDelay;
    const maxDuration = config.maxDuration;
    const pollInterval = config.pollInterval;
    const rconOptions = {
        host: process.env.RCON_HOST || 'zomboid-server',
        port: parseInt(process.env.RCON_PORT) || 27015,
        password: process.env.RCON_PASSWORD || '',
        timeout: 5000, // timeout in milliseconds
    };

    const startTime = Date.now();

    async function poll() {
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxDuration) {
            console.log(`Polling timed out after ${Math.floor(elapsed / 1000)} seconds.`);
            if (silent && interactionForFollowUp) {
                interactionForFollowUp.followUp({
                    content: `⚠️ Server did not respond within the expected time frame. Please try to connect manually.`,
                    ephemeral: true
                });
            } else {
                channel.send(`⚠️ Server did not respond within the expected time frame, <@${userId}>. Please try to connect manually.`);
            }
            return;
        }
        const rcon = new RconClient(rconOptions);
        try {
            await rcon.connect();
            await rcon.disconnect();
            console.log(`Server is back online after ${Math.floor(elapsed / 1000)} seconds.`);
            if (silent && interactionForFollowUp) {
                interactionForFollowUp.followUp({
                    content: `✅ Server is back online!`,
                    ephemeral: true
                });
            } else {
                channel.send(`✅ Server is back online, <@${userId}>!`);
            }
            return;
        } catch (error) {
            // Do nothing, keep polling
        }
        setTimeout(poll, pollInterval);
    }
    setTimeout(poll, initialDelay);
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Endpoint URL: ${config.webhookUrl}`);
    console.log(`Rate limit (minutes): ${config.rateLimit}`);
    console.log(`Restart feature enabled: ${config.restartFeatureEnabled}`);
    console.log(`RCON feature enabled: ${config.rconFeatureEnabled}`);
    console.log(`Poll Initial Delay (ms): ${config.initialDelay}`);
    console.log(`Poll Max Duration (ms): ${config.maxDuration}`);
    console.log(`Poll Interval (ms): ${config.pollInterval}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setrole')
            .setDescription('Configure the restart access role ID')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addStringOption(option =>
                option.setName('role')
                    .setDescription('The role ID that grants restart access')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('getconfig')
            .setDescription('Retrieve the current configuration settings')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setratelimit')
            .setDescription('Configure the rate limit for restarting the server (in minutes)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addNumberOption(option =>
                option.setName('minutes')
                    .setDescription('Rate limit in minutes')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('restartserver')
            .setDescription('Restart the Project Zomboid server')
            .setContexts(InteractionContextType.Guild)
            .toJSON(),
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Bark! Bark! Bark!')
            .setContexts(InteractionContextType.Guild)
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setwebhookurl')
            .setDescription('Configure the webhook URL')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addStringOption(option =>
                option.setName('url')
                    .setDescription('The new webhook URL')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setwebhooktoken')
            .setDescription('Configure the webhook token')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addStringOption(option =>
                option.setName('token')
                    .setDescription('The new webhook token')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setrestartfeature')
            .setDescription('Enable or disable the restart server command')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Set to true to enable or false to disable the restart server command')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setrconfeature')
            .setDescription('Enable or disable the RCON polling feature')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Set to true to enable or false to disable the RCON polling feature')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setinitialdelay')
            .setDescription('Set the initial delay for polling the server (in seconds)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addNumberOption(option =>
                option.setName('seconds')
                    .setDescription('Initial delay in seconds')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setmaxduration')
            .setDescription('Set the maximum duration for polling the server (in seconds)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addNumberOption(option =>
                option.setName('seconds')
                    .setDescription('Maximum duration in seconds')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setpollinterval')
            .setDescription('Set the polling interval (in seconds)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addNumberOption(option =>
                option.setName('seconds')
                    .setDescription('Poll interval in seconds')
                    .setRequired(true)
            )
            .toJSON(),
        // New silentrestart command for admins (all messages are ephemeral)
        new SlashCommandBuilder()
            .setName('silentrestart')
            .setDescription('Silently restart the Project Zomboid server (admins only)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .toJSON()
    ];

    const CLIENT_ID = client.user.id;
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }

    console.log('Populating user cache.');
    client.guilds.cache.forEach(async (guild) => {
        console.log(`Fetching members for guild: ${guild.name} (${guild.id})`);
        try {
            await guild.members.fetch();
            console.log(`Successfully fetched members for guild: ${guild.name}`);
        } catch (error) {
            console.error(`Error fetching members for guild ${guild.name}:`, error);
        }
    });
});

let lastRestartTime = 0;

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        console.log(`Slash command received: ${interaction.commandName}`);

        if (interaction.commandName === 'setrole') {
            const role = interaction.options.getString('role');
            config.restartAccessRoleId = role;
            saveConfig();
            console.log(`Updated restart access role ID to: ${role}`);
            await interaction.reply({ content: `Restart access role ID updated to: ${config.restartAccessRoleId}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'getconfig') {
            console.log('Retrieving current configuration.');
            await interaction.reply({
                content: `Current Configuration:
Role ID: ${config.restartAccessRoleId}
Webhook URL: ${config.webhookUrl || 'Not Set'}
Rate Limit (minutes): ${config.rateLimit}
Restart Feature Enabled: ${config.restartFeatureEnabled}
RCON Feature Enabled: ${config.rconFeatureEnabled}
Poll Initial Delay (ms): ${config.initialDelay}
Poll Max Duration (ms): ${config.maxDuration}
Poll Interval (ms): ${config.pollInterval}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.commandName === 'setratelimit') {
            const minutes = interaction.options.getNumber('minutes');
            config.rateLimit = minutes;
            saveConfig();
            console.log(`Updated rate limit to: ${config.rateLimit} minutes`);
            await interaction.reply({ content: `Rate limit updated to: ${config.rateLimit} minutes`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setwebhookurl') {
            const url = interaction.options.getString('url');
            config.webhookUrl = url;
            saveConfig();
            console.log(`Updated webhook URL to: ${url}`);
            await interaction.reply({ content: `Webhook URL updated to: ${config.webhookUrl}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setwebhooktoken') {
            const token = interaction.options.getString('token');
            config.webhookUrl = `http://portainer:9000/api/webhooks/${token}`;
            saveConfig();
            console.log(`Updated webhook token to: ${token}`);
            await interaction.reply({ content: `Webhook URL updated to: ${config.webhookUrl}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setrestartfeature') {
            const enabled = interaction.options.getBoolean('enabled');
            config.restartFeatureEnabled = enabled;
            saveConfig();
            console.log(`Restart server feature ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
            await interaction.reply({ content: `Restart server feature has been ${enabled ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setrconfeature') {
            const enabled = interaction.options.getBoolean('enabled');
            config.rconFeatureEnabled = enabled;
            saveConfig();
            console.log(`RCON feature ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
            await interaction.reply({ content: `RCON polling feature has been ${enabled ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setinitialdelay') {
            const seconds = interaction.options.getNumber('seconds');
            config.initialDelay = seconds * 1000;
            saveConfig();
            console.log(`Initial delay updated to: ${seconds} seconds`);
            await interaction.reply({ content: `Initial delay updated to ${seconds} seconds.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setmaxduration') {
            const seconds = interaction.options.getNumber('seconds');
            config.maxDuration = seconds * 1000;
            saveConfig();
            console.log(`Max duration updated to: ${seconds} seconds`);
            await interaction.reply({ content: `Max duration updated to ${seconds} seconds.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setpollinterval') {
            const seconds = interaction.options.getNumber('seconds');
            config.pollInterval = seconds * 1000;
            saveConfig();
            console.log(`Poll interval updated to: ${seconds} seconds`);
            await interaction.reply({ content: `Poll interval updated to ${seconds} seconds.`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'restartserver') {
            if (!config.restartFeatureEnabled) {
                console.warn(`Server restart attempted by ${interaction.user.tag}. Restart is currently disabled so no action was taken.`);
                return interaction.reply({ content: 'The restart server command is currently disabled by an administrator.', flags: MessageFlags.Ephemeral });
            }

            console.log(`Server restart initiated by ${interaction.user.tag}`);

            // Check for role permission if a role is set
            if (config.restartAccessRoleId !== 'disabled') {
                if (!interaction.member.roles.cache.has(config.restartAccessRoleId)) {
                    console.warn(`User ${interaction.user.tag} does not have required role ${config.restartAccessRoleId} to restart the server.`);
                    return interaction.reply({ content: 'You do not have the required permissions to restart the server!', flags: MessageFlags.Ephemeral });
                }
            }

            // Check rate limit based on the config setting
            const RATE_LIMIT_MS = config.rateLimit * 60 * 1000;
            const currentTime = Date.now();
            if (currentTime - lastRestartTime < RATE_LIMIT_MS) {
                const remainingTime = RATE_LIMIT_MS - (currentTime - lastRestartTime);
                const minutesRemaining = Math.floor(remainingTime / 60000);
                const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
                console.warn(`The server has already been restarted. Deferring for ${minutesRemaining} minutes and ${secondsRemaining} seconds.`);
                return interaction.reply({ content: `The server has already been restarted recently. Please wait ${minutesRemaining} minutes and ${secondsRemaining} seconds before trying again!`, flags: MessageFlags.Ephemeral });
            }

            // Send confirmation message with buttons for public restart
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_restart')
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_restart')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ content: 'Are you sure you want to restart the server?', components: [row], flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'silentrestart') {
            console.log(`Silent server restart initiated by ${interaction.user.tag}`);
            // Check rate limit
            const RATE_LIMIT_MS = config.rateLimit * 60 * 1000;
            const currentTime = Date.now();
            if (currentTime - lastRestartTime < RATE_LIMIT_MS) {
                const remainingTime = RATE_LIMIT_MS - (currentTime - lastRestartTime);
                const minutesRemaining = Math.floor(remainingTime / 60000);
                const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
                console.warn(`The server has already been restarted. Deferring for ${minutesRemaining} minutes and ${secondsRemaining} seconds.`);
                return interaction.reply({ content: `The server has already been restarted recently. Please wait ${minutesRemaining} minutes and ${secondsRemaining} seconds before trying again!`, flags: MessageFlags.Ephemeral });
            }
            // Send confirmation message with buttons for silent restart
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_silentrestart')
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_silentrestart')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
            await interaction.reply({ content: 'Are you sure you want to silently restart the server?', components: [row], flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'help') {
            const helpMessage = "I am Spiffio! If the server needs an update or a restart, just use my restartserver command to restart the server!";
            await interaction.reply({ content: helpMessage, flags: MessageFlags.Ephemeral });
        }
    }

    // Handle button interactions for confirmation
    if (interaction.isButton()) {
        // Ensure only the user who initiated the command can use the buttons.
        const originalUserId = interaction.message.interactionMetadata?.user.id;
        if (interaction.user.id !== originalUserId) {
            return interaction.reply({ content: "You can't interact with this confirmation.", flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'confirm_restart') {
            lastRestartTime = Date.now();
            await interaction.update({ content: 'Restarting server...', components: [] });
            try {
                const response = await fetch(config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    console.log('Server restarted successfully');
                    await interaction.channel.send(`✅ Server restart initiated successfully!\n`);
                    if (config.rconFeatureEnabled) {
                        await interaction.channel.send(`<@${interaction.user.id}>, I will message you when it is back online!\nThis can take up to 5-10 minutes.`);
                        pollServer(interaction.user.id, interaction.channel);
                    } else {
                        interaction.channel.send(`Please wait for the server to come back online.\nThis can take up to 5-10 minutes.`);
                    }
                } else {
                    console.error(`Server restart failed with response status ${response.status}`);
                    await interaction.channel.send(`❌ Server restart failed.\nI will notify an admin.\n<@${interaction.user.id}>'s attempt to restart the server failed. Please investigate.`);
                }
            } catch (error) {
                console.error('Error processing restartserver command:', error);
                await interaction.channel.send(`❌ Server restart failed.\nI will notify an admin.\n<@${interaction.user.id}>'s attempt to restart the server failed. Please investigate.`);
            }
        } else if (interaction.customId === 'cancel_restart') {
            await interaction.update({ content: 'Server restart cancelled.', components: [] });
        } else if (interaction.customId === 'confirm_silentrestart') {
            lastRestartTime = Date.now();
            await interaction.update({ content: 'Restarting server silently...', components: [] });
            try {
                const response = await fetch(config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                if (response.ok) {
                    console.log('Server restarted silently successfully');
                    await interaction.followUp({ content: '✅ Server restart initiated successfully!', flags: MessageFlags.Ephemeral });
                    if (config.rconFeatureEnabled) {
                        await interaction.followUp({
                            content: `I will notify you when the server is back online. This can take up to 5-10 minutes.`,
                            flags: MessageFlags.Ephemeral
                        });
                        pollServer(interaction.user.id, interaction.channel, true, interaction);
                    }
                } else {
                    console.error(`Server restart failed with response status ${response.status}`);
                    await interaction.followUp({ content: '❌ Server restart failed. Please investigate.', flags: MessageFlags.Ephemeral });
                }
            } catch (error) {
                console.error('Error processing silentrestart command:', error);
                await interaction.followUp({ content: '❌ Server restart failed. Please investigate.', flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.customId === 'cancel_silentrestart') {
            await interaction.update({ content: 'Silent server restart cancelled.', components: [] });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
