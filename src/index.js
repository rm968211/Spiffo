require('dotenv').config();
const { Client, GatewayIntentBits, InteractionContextType, PermissionsBitField, SlashCommandBuilder, REST, Routes, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

let lastRestartTime = 0;
let rateLimitMinutes = Number(process.env.RATE_LIMIT) || 10;

let config = {
    restartAccessRoleId: process.env.RESTART_ACCESS_ROLE_ID || 'disabled',
    webhookUrl: process.env.WEBHOOK_URL || null
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Endpoint url: ${config.webhookUrl}`);
    console.log(`Rate limit minutes: ${rateLimitMinutes}`);

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
            .setDescription('Retrieve the current role ID, rate limit, and endpoint settings')
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

client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        console.log(`Slash command received: ${interaction.commandName}`);

        if (interaction.commandName === 'setrole') {
            const role = interaction.options.getString('role');
            config.restartAccessRoleId = role;
            console.log(`Updated restart access role ID to: ${role}`);
            await interaction.reply({ content: `Restart access role ID updated to: ${config.restartAccessRoleId}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'getconfig') {
            console.log('Retrieving current configuration.');
            await interaction.reply({
                content: `Current Configuration:\nRole ID: ${config.restartAccessRoleId}\nWebhook URL: ${config.webhookUrl || 'Not Set'}\nRate Limit (minutes): ${rateLimitMinutes}`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.commandName === 'setratelimit') {
            const minutes = interaction.options.getNumber('minutes');
            rateLimitMinutes = minutes;
            console.log(`Updated rate limit to: ${rateLimitMinutes} minutes`);
            await interaction.reply({ content: `Rate limit updated to: ${rateLimitMinutes} minutes`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'restartserver') {
            console.log(`Server restart initiated by ${interaction.user.tag}`);

            // Check for role permission
            if (config.restartAccessRoleId !== 'disabled') {
                if (!interaction.member.roles.cache.has(config.restartAccessRoleId)) {
                    console.log(`User ${interaction.user.tag} does not have required role ${config.restartAccessRoleId}`);
                    return interaction.reply({ content: 'You do not have the required permissions to restart the server!', flags: MessageFlags.Ephemeral });
                }
            }

            // Check rate limit
            const RATE_LIMIT_MS = rateLimitMinutes * 60 * 1000;
            const currentTime = Date.now();
            if (currentTime - lastRestartTime < RATE_LIMIT_MS) {
                const remainingTime = RATE_LIMIT_MS - (currentTime - lastRestartTime);
                const minutesRemaining = Math.floor(remainingTime / 60000);
                const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
                return interaction.reply({ content: `The server has already been restarted. Please wait ${minutesRemaining} minutes and ${secondsRemaining} seconds before trying again!`, flags: MessageFlags.Ephemeral });
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

            // Save the original user id in the reply context (via the interaction's message)
            await interaction.reply({ content: 'Are you sure you want to restart the server?', components: [row], ephemeral: true });
        }

        if (interaction.commandName === 'help') {
            const helpMessage = `I am Spiffio! If the server needs an update or a restart, just use my restartserver slash command to restart the server!`;
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
            // Update the last restart time and indicate that the restart is in progress.
            lastRestartTime = Date.now();
            await interaction.update({ content: 'Restarting server...', components: [] });
            try {
                const response = await fetch(config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                const result = await response.json();
                let replyMessage;
                if (response.ok) {
                    console.log(`Server restarted successfully`);
                    replyMessage = `✅ Server restarted successfully!\nPlease wait for the server to come back online.\nThis can take up to 5-10 minutes.`;
                } else {
                    console.error(`Server restart failed with response status ${response.status}`);
                    replyMessage = `❌ Server restart failed.\nPlease bother an admin.`;
                }

                // Send a follow-up message with the final result.
                await interaction.followUp({ content: replyMessage});
            } catch (error) {
                console.error('Error processing restartserver command:', error);
                await interaction.followUp({ content: 'Error processing restartserver command.\nPlease bother an admin.'});
            }
        } else if (interaction.customId === 'cancel_restart') {
            await interaction.update({ content: 'Server restart cancelled.', components: [], flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
