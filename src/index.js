require('dotenv').config();
const { Client, GatewayIntentBits, InteractionContextType, PermissionsBitField, Partials, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Needed to watch role update events.
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] // Necessary for receiving DMs.
});

// Global configuration that will be updated via slash commands or environment variables.
let config = {
    restartAccessRoleId: process.env.RESTART_ACCESS_ROLE_ID || 'disabled',
    endpointUrl: process.env.ENDPOINT_URL || null
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Restart access role ID: ${config.restartAccessRoleId}`);
    console.log(`Endpoint url: ${config.endpointUrl}`);

    // Register slash commands
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

// Handle slash command interactions.
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    console.log(`Slash command received: ${interaction.commandName}`);

    if (interaction.commandName === 'setRole') {
        const role = interaction.options.getString('role');
        config.targetRoleId = role;
        console.log(`Updated restart access role ID to: ${role}`);
        await interaction.reply({ content: `restart access role ID updated to: ${config.targetRoleId}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === 'getConfig') {
        console.log('Retrieving current configuration.');
        await interaction.reply({
            content: `Current Configuration:\nRole ID: ${config.restartAccessRoleId}\nWebhook Endpoint: ${config.endpointUrl || 'Not Set'}`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'restartServer') {
        console.log(`Server restart initiated by ${interaction.user.tag}`);
        // Defer the reply to allow time for processing. This reply will be public.
        await interaction.deferReply();
        try {
            const response = await fetch(ENDPOINT_URL, {
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
});

client.login(process.env.DISCORD_BOT_TOKEN);
