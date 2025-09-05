//#region Imports, Versioning and stuff
const VERSION = "1.0";
const AUTHOR = "Lilith the Succubus";

const Discord = require('discord.js');
const fs = require('fs');
const { GatewayIntentBits, Partials } = require('discord.js');

// Create bot client
const bot = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Command handling
bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    bot.commands.set(command.name, command);
}

// Environment-based config (Railway)
const config = {
  token: process.env.TOKEN,
  server_id: process.env.SERVER_ID,
  target_channel: process.env.TARGET_CHANNEL,
  nickname: process.env.NICKNAME,
  prefix: process.env.PREFIX || "!"
};

// Nickname change settings
const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];
const targetChannelId = config.target_channel;
const newNickname = config.nickname || "New Nickname";

// Map to track original nicknames per user
const originalNicknames = new Map();

// Require commands
const nick = require('./commands/nick.js');

//#endregion

bot.once('ready', () => {
    console.log(`Bot logged in as ${bot.user.tag}\nVersion: ${VERSION}`);
});

// Message handling
bot.on('messageCreate', async (msg) => {
    if (!msg.content.startsWith(config.prefix) || msg.author.bot) return;

    let cmdString = msg.content.substring(config.prefix.length);
    let args = cmdString.toLowerCase().split(/ +/);
    let command = cmdString.match(/^\d+/) ? 'r' : args[0];

    if (!bot.commands.has(command)) return;

    try {
        if (msg.content.includes("info")) {
            msg.reply(bot.commands.get(command).description);
        } else if (msg.content.includes("debug")) {
            bot.commands.get(command).debug(msg, args);
        } else {
            if (bot.commands.get(command).experimental && !process.env.EXPERIMENTAL_COMMANDS) {
                return msg.reply("ERROR: This command is experimental. Enable EXPERIMENTAL_COMMANDS env variable to use.");
            } else {
                bot.commands.get(command).execute(msg, args);
            }
        }
    } catch (error) {
        console.error(error);
        msg.reply('ERROR: Invalid Syntax');
    }

    // Nickname change logic
    if (!allowedUsers.includes(msg.author.id)) return;

    const member = msg.guild.members.cache.get(msg.author.id);
    if (!member) return;

    try {
        if (!originalNicknames.has(member.id)) {
            originalNicknames.set(member.id, member.nickname || member.user.username);
        }

        if (msg.channel.id === targetChannelId) {
            await member.setNickname(newNickname);
            console.log(`Changed nickname for ${member.user.username}`);
        } else {
            const original = originalNicknames.get(member.id);
            await member.setNickname(original);
            originalNicknames.delete(member.id);
            console.log(`Restored nickname for ${member.user.username}`);
        }
    } catch (err) {
        console.error(`Failed to change/restore nickname for ${member.user.username}:`, err);
    }
});

// Voice state updates
bot.on('voiceStateUpdate', (oldState, newState) => {
    bot.commands.get('nick').renameNickname(oldState, newState);
});

// Login
bot.login(config.token)
    .then(() => console.log("Bot login successful"))
    .catch(error => console.log("Bot login failed:", error));