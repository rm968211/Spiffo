require('dotenv').config();
const { Client, GatewayIntentBits, InteractionContextType, PermissionsBitField, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

// Global variables for rate limiting
let lastRestartTime = 0;
const RATE_LIMIT_MINUTES = Number(process.env.RESTART_SERVER_RATE_LIMIT) || 10;

let config = {
    restartAccessRoleId: process.env.RESTART_ACCESS_ROLE_ID || 'disabled',
    webhookUrl: process.env.WEBHOOK_URL || null
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Endpoint url: ${config.webhookUrl}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setRole')
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
            .setName('getConfig')
            .setDescription('Retrieve the current role ID and endpoint settings')
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
            .toJSON(),
        new SlashCommandBuilder()
            .setName('restartServer')
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
    if (!interaction.isChatInputCommand()) return;
    console.log(`Slash command received: ${interaction.commandName}`);

    if (interaction.commandName === 'setRole') {
        const role = interaction.options.getString('role');
        config.restartAccessRoleId = role;
        console.log(`Updated restart access role ID to: ${role}`);
        await interaction.reply({ content: `Restart access role ID updated to: ${config.restartAccessRoleId}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'getConfig') {
        console.log('Retrieving current configuration.');
        await interaction.reply({
            content: `Current Configuration:\nRole ID: ${config.restartAccessRoleId}\nWebhook URL: ${config.webhookUrl || 'Not Set'}`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'restartServer') {
        console.log(`Server restart initiated by ${interaction.user.tag}`);
        
        if (config.restartAccessRoleId !== 'disabled') {
            if (!interaction.member.roles.cache.has(config.restartAccessRoleId)) {
                console.log(`User ${interaction.user.tag} does not have required role ${config.restartAccessRoleId}`);
                return interaction.reply({ content: 'You do not have the required permissions to restart the server!'});
            }
        }
        
        // Rate limiting check
        const RATE_LIMIT_MS = RATE_LIMIT_MINUTES * 60 * 1000;
        const currentTime = Date.now();
        if (currentTime - lastRestartTime < RATE_LIMIT_MS) {
            const remainingTime = RATE_LIMIT_MS - (currentTime - lastRestartTime);
            const minutesRemaining = Math.floor(remainingTime / 60000);
            const secondsRemaining = Math.floor((remainingTime % 60000) / 1000);
            return interaction.reply({content: `The server has already been restarted. Please wait ${minutesRemaining} minutes and ${secondsRemaining} seconds before trying again!`});
        }
        
        // Update the last restart time
        lastRestartTime = currentTime;

        await interaction.deferReply();
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
    
            await interaction.editReply(replyMessage);
        } catch (error) {
            console.error('Error processing restartServer command:', error);
            await interaction.editReply('Error processing restartServer command.\nPlease bother an admin.');
        }
    }

    // New help command handler
    if (interaction.commandName === 'help') {
        const helpMessage = `I am Spiffio! If the server needs an update or a restart, just use my restartServer slash command to restart the server!`;
        await interaction.reply({ content: helpMessage, flags: MessageFlags.Ephemeral });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
