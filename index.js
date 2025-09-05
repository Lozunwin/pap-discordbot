//#region Imports, Versioning, and Setup
const VERSION = "1.0";
const AUTHOR = "Lilith the Succubus";

const fs = require('fs');
const Discord = require('discord.js');
const { GatewayIntentBits, Partials } = require('discord.js');

require('dotenv').config();
//#endregion

//#region Bot Client
const bot = new Discord.Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping
  ],
  partials: [Partials.Channel, Partials.Message]
});
//#endregion

//#region Config & Nickname Setup
const config = {
  token: process.env.TOKEN,
  server_id: process.env.SERVER_ID,
  target_channel: process.env.TARGET_CHANNEL,
  nickname: process.env.NICKNAME || "New Nickname",
  prefix: process.env.PREFIX || "!",
  restoreDelay: 60000, // 60 seconds delay for text channel nickname restoration
};

const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];
const targetChannelId = config.target_channel;
const newNickname = config.nickname;

const originalNicknames = new Map();
const typingTimers = new Map(); // to track inactive users
const nick = require('./commands/nick.js');
//#endregion

//#region Helper Function
async function handleNickname(member, inTargetChannel) {
  if (!allowedUsers.includes(member.id)) return;

  try {
    if (inTargetChannel) {
      if (!originalNicknames.has(member.id)) {
        originalNicknames.set(member.id, member.nickname); // store previous server nickname
      }
      if (member.nickname !== newNickname) {
        await member.setNickname(newNickname);
        console.log(`[NICK] ${member.user.tag} ➜ "${newNickname}"`);
      }

      // Reset inactivity timer
      if (typingTimers.has(member.id)) clearTimeout(typingTimers.get(member.id));
      typingTimers.set(member.id, setTimeout(() => {
        restoreNickname(member);
      }, config.restoreDelay));

    } else {
      restoreNickname(member);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to change/restore nickname for ${member.user.tag}:`, err);
  }
}

async function restoreNickname(member) {
  if (!originalNicknames.has(member.id)) return;

  try {
    const original = originalNicknames.get(member.id); // can be null
    if (member.nickname !== original) {
      await member.setNickname(original);
      console.log(`[NICK] ${member.user.tag} restored ➜ "${original || member.user.username}"`);
    }
    originalNicknames.delete(member.id);

    if (typingTimers.has(member.id)) {
      clearTimeout(typingTimers.get(member.id));
      typingTimers.delete(member.id);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to restore nickname for ${member.user.tag}:`, err);
  }
}
//#endregion

//#region Bot Events
bot.once('ready', () => {
  console.log(`Bot logged in as ${bot.user.tag}\nVersion: ${VERSION}`);
});

// Voice channel join/leave
bot.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member) return;

  const inOld = oldState.channelId === targetChannelId;
  const inNew = newState.channelId === targetChannelId;

  if (!inOld && inNew) handleNickname(member, true);   // joined
  if (inOld && !inNew) handleNickname(member, false);  // left

  if (bot.commands.has('nick')) bot.commands.get('nick').renameNickname(oldState, newState);
});

// Message sent in target text channel
bot.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  const member = msg.guild.members.cache.get(msg.author.id);
  if (!member) return;

  const inTarget = msg.channel.id === targetChannelId;
  handleNickname(member, inTarget);

  if (!msg.content.startsWith(config.prefix)) return;

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
});

// User starts typing in target text channel
bot.on('typingStart', async (channel, user) => {
  if (channel.id !== targetChannelId) return;

  const member = channel.guild.members.cache.get(user.id);
  if (!member) return;

  handleNickname(member, true);
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
