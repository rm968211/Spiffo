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

const HELP_MESSAGE = "I am Spiffo! If the server needs an update or a restart, just use my restartserver command to restart the server!";

const MENTION_HELP_MESSAGE = [
    "Bark! I am Spiffo! Tagging me doesn't do anything — I only listen to slash commands.",
    "",
    "To restart the server:",
    "1. Type `/` in the message box (just the slash — don't send it yet).",
    "2. A menu pops up. Pick **/restartserver** from the list, or keep typing `restartserver` to filter it down.",
    "3. Press Enter to send, then hit **Confirm** on the buttons I show you.",
    "",
    "Type `/help` the same way any time you need this again."
].join('\n');

const configPath = process.env.CONFIG_PATH || path.join('/data', 'config.json');

let config = {
    restartFeatureEnabled: true,
    rconFeatureEnabled: true,
    rateLimit: 12, // in minutes
    restartAccessRoleId: 'disabled',
    initialDelay: 60000, // 1 minute in milliseconds
    maxDuration: 720000,  // 12 minutes in milliseconds
    pollInterval: 15000    // 15 seconds in milliseconds
};

function saveConfig() {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    } catch (error) {
        console.error('Error saving config file:', error);
    }
}

if (fs.existsSync(configPath)) {
    try {
        const fileData = fs.readFileSync(configPath);
        const fileConfig = JSON.parse(fileData);
        config = { ...config, ...fileConfig };
    } catch (error) {
        console.error('Error reading config file, using defaults.', error);
    }
} else {
    saveConfig();
}

async function restartServer(user) {
    const url = `${process.env.PZ_APP_URL}/api/server/update`;
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.PZ_API_KEY
        },
        body: JSON.stringify({notes: `Restarted via Discord by ${user.tag} (${user.id})`})
    });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ]
});

/**
 * Polls the RCON port until a valid response is received or the timeout is reached.
 * Sends ephemeral follow-ups via the provided interaction.
 */
async function pollServer(interaction) {
    const initialDelay = config.initialDelay;
    // Ephemeral follow-ups ride the interaction token, which expires after 15
    // minutes — cap polling at 14 so the final notice can still be delivered.
    const maxDuration = Math.min(config.maxDuration, 840000);
    const pollInterval = config.pollInterval;
    const rconOptions = {
        host: process.env.RCON_HOST || 'zomboid-server',
        port: parseInt(process.env.RCON_PORT) || 27015,
        password: process.env.RCON_PASSWORD || '',
        timeout: 5000,
    };

    const startTime = Date.now();

    async function poll() {
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxDuration) {
            console.log(`Polling timed out after ${Math.floor(elapsed / 1000)} seconds.`);
            await interaction.followUp({
                content: `⚠️ Server did not respond within the expected time frame. Please try to connect manually.`,
                flags: MessageFlags.Ephemeral
            }).catch(err => console.error('Failed to send follow-up:', err));
            return;
        }
        const rcon = new RconClient(rconOptions);
        try {
            await rcon.connect();
            await rcon.disconnect();
            console.log(`Server is back online after ${Math.floor(elapsed / 1000)} seconds.`);
            await interaction.followUp({
                content: `✅ Server is back online!`,
                flags: MessageFlags.Ephemeral
            }).catch(err => console.error('Failed to send follow-up:', err));
            return;
        } catch (error) {
            // keep polling
        }
        setTimeout(poll, pollInterval);
    }
    setTimeout(poll, initialDelay);
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Manager URL: ${process.env.PZ_APP_URL}`);
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
            .setDescription('Set the maximum duration for polling the server (in minutes)')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addNumberOption(option =>
                option.setName('minutes')
                    .setDescription('Maximum duration in minutes')
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
Manager URL: ${process.env.PZ_APP_URL || 'Not Set'}
Rate Limit (minutes): ${config.rateLimit}
Restart Feature Enabled: ${config.restartFeatureEnabled}
RCON Feature Enabled: ${config.rconFeatureEnabled}
Poll Initial Delay (seconds): ${config.initialDelay / 1000}
Poll Max Duration (minutes): ${config.maxDuration / 60000}
Poll Interval (seconds): ${config.pollInterval / 1000}`,
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
            const minutes = interaction.options.getNumber('minutes');
            config.maxDuration = minutes * 60 * 1000;
            saveConfig();
            console.log(`Max duration updated to: ${minutes} minutes`);
            await interaction.reply({ content: `Max duration updated to ${minutes} minutes.`, flags: MessageFlags.Ephemeral });
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

            if (config.restartAccessRoleId !== 'disabled') {
                if (!interaction.member.roles.cache.has(config.restartAccessRoleId)) {
                    console.warn(`User ${interaction.user.tag} does not have required role ${config.restartAccessRoleId} to restart the server.`);
                    return interaction.reply({ content: 'You do not have the required permissions to restart the server!', flags: MessageFlags.Ephemeral });
                }
            }

            const RATE_LIMIT_MS = config.rateLimit * 60 * 1000;
            const currentTime = Date.now();
            if (currentTime - lastRestartTime < RATE_LIMIT_MS) {
                const remainingTime = RATE_LIMIT_MS - (currentTime - lastRestartTime);
                const minutesRemaining = Math.floor(remainingTime / 60000);
                const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
                console.warn(`The server has already been restarted. Deferring for ${minutesRemaining} minutes and ${secondsRemaining} seconds.`);
                return interaction.reply({ content: `The server has already been restarted recently. Please wait ${minutesRemaining} minutes and ${secondsRemaining} seconds before trying again!`, flags: MessageFlags.Ephemeral });
            }

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

        if (interaction.commandName === 'help') {
            await interaction.reply({ content: HELP_MESSAGE, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.isButton()) {
        const originalUserId = interaction.message.interactionMetadata?.user.id;
        if (interaction.user.id !== originalUserId) {
            return interaction.reply({ content: "You can't interact with this confirmation.", flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'confirm_restart') {
            lastRestartTime = Date.now();
            await interaction.update({ content: 'Restarting server...', components: [] });
            try {
                const response = await restartServer(interaction.user);

                if (response.ok) {
                    console.log('Server restart initiated successfully');
                    await interaction.followUp({ content: '✅ Server restart initiated successfully!', flags: MessageFlags.Ephemeral });
                    if (config.rconFeatureEnabled) {
                        await interaction.followUp({
                            content: `I will notify you when the server is back online. This can take up to 5-10 minutes.`,
                            flags: MessageFlags.Ephemeral
                        });
                        pollServer(interaction);
                    } else {
                        await interaction.followUp({
                            content: `Please wait for the server to come back online.\nThis can take up to 5-10 minutes.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else {
                    console.error(`Server restart failed with response status ${response.status}`);
                    await interaction.followUp({ content: '❌ Server restart failed.', flags: MessageFlags.Ephemeral });
                }
            } catch (error) {
                console.error('Error processing restartserver command:', error);
                await interaction.followUp({ content: '❌ Server restart failed.', flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.customId === 'cancel_restart') {
            await interaction.update({ content: 'Server restart cancelled.', components: [] });
        }
    }
});

client.on('messageCreate', async message => {
    // users.has, not mentions.has — the latter also matches @everyone and role pings.
    if (message.author.bot || !message.mentions.users.has(client.user.id)) return;
    console.log(`Mentioned by ${message.author.tag} in #${message.channel.name}`);
    await message.reply(MENTION_HELP_MESSAGE).catch(err => console.error('Failed to reply to mention:', err));
});

client.login(process.env.DISCORD_BOT_TOKEN);
