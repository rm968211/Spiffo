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

const configPath = process.env.CONFIG_PATH || path.join('/data', 'config.json');

let config = {
    restartFeatureEnabled: true,
    rateLimit: 12, // in minutes
    restartAccessRoleId: 'disabled',
    webhookUrl: null
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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Endpoint URL: ${config.webhookUrl}`);
    console.log(`Rate limit (minutes): ${config.rateLimit}`);
    console.log(`Restart feature enabled: ${config.restartFeatureEnabled}`);

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
            .setName('setwebhook')
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
            .setName('setrestartfeature')
            .setDescription('Enable or disable the restart server command')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription('Set to true to enable or false to disable the restart server command')
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
Webhook URL: ${config.webhookUrl || 'Not Set'}
Rate Limit (minutes): ${config.rateLimit}
Restart Feature Enabled: ${config.restartFeatureEnabled}`,
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

        if (interaction.commandName === 'setwebhook') {
            const url = interaction.options.getString('url');
            config.webhookUrl = url;
            saveConfig();
            console.log(`Updated webhook URL to: ${url}`);
            await interaction.reply({ content: `Webhook URL updated to: ${config.webhookUrl}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'setrestartfeature') {
            const enabled = interaction.options.getBoolean('enabled');
            config.restartFeatureEnabled = enabled;
            saveConfig();
            console.log(`Restart server feature ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
            await interaction.reply({ content: `Restart server feature has been ${enabled ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
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

            // Send confirmation message with buttons
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
                    await interaction.channel.send(
                        `✅ Server restarted successfully by <@${interaction.user.id}>!\n` +
                        `Please wait for the server to come back online.\n` +
                        `This can take up to 5-10 minutes.`
                    );
                } else {
                    console.error(`Server restart failed with response status ${response.status}`);
                    await interaction.channel.send(
                        `❌ Server restart failed.\n` +
                        `I will bother an admin for you.\n` +
                        `@Kim Il Sung <@${interaction.user.id}>'s attempt to restart the server failed. Please investigate.`
                    );
                }
            } catch (error) {
                console.error('Error processing restartserver command:', error);
                await interaction.channel.send(
                    `❌ Server restart failed.\n` +
                    `I will bother an admin for you.\n` +
                    `@Kim Il Sung <@${interaction.user.id}>'s attempt to restart the server failed. Please investigate.`
                );
            }
        } else if (interaction.customId === 'cancel_restart') {
            await interaction.update({ content: 'Server restart cancelled.', components: [] });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
