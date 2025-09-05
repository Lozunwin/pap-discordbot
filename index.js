//#region Imports, Versioning, and Setup
const VERSION = "1.0";
const AUTHOR = "Lilith the Succubus";

const fs = require('fs');
const Discord = require('discord.js');
const { GatewayIntentBits, Partials } = require('discord.js');

// Load environment variables from .env locally
require('dotenv').config();

//#endregion

//#region Bot Client
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
//#endregion

//#region Command Handling
bot.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  bot.commands.set(command.name, command);
}
//#endregion

//#region Config & Nickname Setup
const config = {
  token: process.env.TOKEN,
  server_id: process.env.SERVER_ID,
  target_channel: process.env.TARGET_CHANNEL,
  nickname: process.env.NICKNAME || "New Nickname",
  prefix: process.env.PREFIX || "!",
};

const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];
const targetChannelId = config.target_channel;
const newNickname = config.nickname;

const originalNicknames = new Map();
const nick = require('./commands/nick.js');
//#endregion

//#region Bot Events
bot.once('ready', () => {
  console.log(`Bot logged in as ${bot.user.tag}\nVersion: ${VERSION}`);
});

bot.on('messageCreate', async (msg) => {
  if (!msg.content.startsWith(config.prefix) || msg.author.bot) return;

  const cmdString = msg.content.substring(config.prefix.length);
  const args = cmdString.toLowerCase().split(/ +/);
  const command = cmdString.match(/^\d+/) ? 'r' : args[0];

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

  // Nickname Change Logic
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

bot.on('voiceStateUpdate', (oldState, newState) => {
  bot.commands.get('nick').renameNickname(oldState, newState);
});
//#endregion

//#region Bot Login
if (!config.token) {
  console.error("❌ Bot token missing! Set TOKEN in your .env or Railway environment variables.");
  process.exit(1);
}

bot.login(config.token)
  .then(() => console.log("Bot login successful"))
  .catch(err => console.error("❌ Bot login failed:", err));
//#endregion