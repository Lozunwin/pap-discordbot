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
};

const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];
const targetChannelId = config.target_channel;
const newNickname = config.nickname;

// HEX color role ID for Discord role (can be added as Railway env variable)
const colorRoleId = process.env.COLOR_ROLE_ID; // set your color role ID in Railway env

const originalNicknames = new Map(); // stores previous nickname
const originalRoles = new Map();     // stores previous roles
const nick = require('./commands/nick.js');
//#endregion

//#region Helper Functions
async function handleNickname(member, inTargetChannel) {
  if (!allowedUsers.includes(member.id)) return;

  try {
    if (inTargetChannel) {
      // store previous nickname & roles if not stored
      if (!originalNicknames.has(member.id)) originalNicknames.set(member.id, member.nickname);
      if (colorRoleId && !originalRoles.has(member.id)) originalRoles.set(member.id, member.roles.cache.map(r => r.id));

      // set nickname
      if (member.nickname !== newNickname) {
        await member.setNickname(newNickname);
        console.log(`[NICK] ${member.user.tag} ➜ "${newNickname}"`);
      }

      // add color role
      if (colorRoleId && !member.roles.cache.has(colorRoleId)) {
        await member.roles.add(colorRoleId);
        console.log(`[ROLE] ${member.user.tag} added color role`);
      }

    } else {
      restoreNickname(member); // restore if leaving target
    }
  } catch (err) {
    console.error(`[ERROR] Failed to change nickname/role for ${member.user.tag}:`, err);
  }
}

async function restoreNickname(member) {
  if (!originalNicknames.has(member.id)) return;

  try {
    // restore nickname
    const originalNick = originalNicknames.get(member.id);
    if (member.nickname !== originalNick) {
      await member.setNickname(originalNick);
      console.log(`[NICK] ${member.user.tag} restored ➜ "${originalNick || member.user.username}"`);
    }
    originalNicknames.delete(member.id);

    // restore roles
    if (colorRoleId && originalRoles.has(member.id)) {
      const previousRoles = originalRoles.get(member.id);
      await member.roles.set(previousRoles); // restore all previous roles
      console.log(`[ROLE] ${member.user.tag} roles restored`);
      originalRoles.delete(member.id);
    }

  } catch (err) {
    console.error(`[ERROR] Failed to restore nickname/role for ${member.user.tag}:`, err);
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