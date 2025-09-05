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

//#region Config & Nickname/Role Setup
const config = {
  token: process.env.TOKEN,
  server_id: process.env.SERVER_ID,
  target_channel: process.env.TARGET_CHANNEL,
  nickname: process.env.NICKNAME || "New Nickname",
  color_role_id: process.env.COLOR_ROLE_ID, // color role ID
  prefix: process.env.PREFIX || "!",
};

const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : [];
const targetChannelId = config.target_channel;
const newNickname = config.nickname;
const colorRoleId = config.color_role_id;

const originalNicknames = new Map(); // stores previous nickname per user
const originalRoles = new Map();     // stores previous color role per user
const nick = require('./commands/nick.js');
//#endregion

//#region Helper Functions
async function handleNickname(member, inTargetChannel) {
  if (!allowedUsers.includes(member.id)) return;

  try {
    if (inTargetChannel) {
      // Store previous nickname and color role
      if (!originalNicknames.has(member.id)) {
        originalNicknames.set(member.id, member.nickname);
      }

      if (!originalRoles.has(member.id) && colorRoleId) {
        const currentColorRole = member.roles.cache.find(r => r.id === colorRoleId);
        originalRoles.set(member.id, currentColorRole ? currentColorRole.id : null);
      }

      // Apply new nickname if needed
      if (member.nickname !== newNickname) {
        await member.setNickname(newNickname);
        console.log(`[NICK] ${member.user.tag} ➜ "${newNickname}"`);
      }

      // Apply color role if defined and not already applied
      if (colorRoleId && !member.roles.cache.has(colorRoleId)) {
        await member.roles.add(colorRoleId);
        console.log(`[ROLE] ${member.user.tag} color role applied`);
      }

    } else {
      await restoreNickname(member);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to change/restore nickname for ${member.user.tag}:`, err);
  }
}

async function restoreNickname(member) {
  try {
    // Restore nickname
    if (originalNicknames.has(member.id)) {
      const originalNick = originalNicknames.get(member.id);
      if (member.nickname !== originalNick) {
        await member.setNickname(originalNick);
        console.log(`[NICK] ${member.user.tag} restored ➜ "${originalNick || member.user.username}"`);
      }
      originalNicknames.delete(member.id);
    }

    // Restore color role
    if (colorRoleId && originalRoles.has(member.id)) {
      const previousRoleId = originalRoles.get(member.id);

      if (previousRoleId !== colorRoleId) {
        // Remove the color role we applied
        if (member.roles.cache.has(colorRoleId)) {
          await member.roles.remove(colorRoleId);
          console.log(`[ROLE] ${member.user.tag} color role removed`);
        }
        // Reapply previous role if exists
        if (previousRoleId) {
          await member.roles.add(previousRoleId);
          console.log(`[ROLE] ${member.user.tag} previous color role restored`);
        }
      }

      originalRoles.delete(member.id);
    }

  } catch (err) {
    console.error(`[ERROR] Failed to restore nickname/color for ${member.user.tag}:`, err);
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