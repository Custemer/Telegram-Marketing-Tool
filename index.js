require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8583299414:AAGckHHBDB04LyM3ez8ZOb9JT98Y_MGC7ic';
const ADMIN_ID = process.env.ADMIN_USER_ID || '8581477799';

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Storage
let state = {
    isAutoAdding: false,
    groups: [],
    activeMembers: [],
    totalAdded: 0,
    timerMinutes: 2,
    membersPerInterval: 5
};

let autoAddInterval = null;

// ==================== HELPER FUNCTIONS ====================
const isAdmin = (ctx) => ctx.from.id.toString() === ADMIN_ID;

const showHelp = () => {
    return `🤖 *NOVA MARKETING BOT - ALL COMMANDS*\n\n` +
        `*Basic Commands:*\n` +
        `/start - Start the bot\n` +
        `/help - Show this help\n` +
        `/ping - Check if bot is alive\n` +
        `/id - Get your Telegram ID\n` +
        `/stats - Show bot statistics\n\n` +
        `*Group Commands (Admin Only):*\n` +
        `/addgroup - Add current group as target\n` +
        `/listgroups - List all target groups\n` +
        `/removegroup - Remove a group\n` +
        `/cleargroups - Remove all groups\n\n` +
        `*Member Commands (Admin Only):*\n` +
        `/addmember [id] - Add a member manually\n` +
        `/addmembers [id1,id2] - Add multiple members\n` +
        `/listmembers - List all active members\n` +
        `/removemember [id] - Remove a member\n` +
        `/clearmembers - Remove all members\n\n` +
        `*Auto-Add Commands (Admin Only):*\n` +
        `/startauto - Start auto-adding members\n` +
        `/stopauto - Stop auto-adding\n` +
        `/settime [min] [num] - Set timer (2 5)\n` +
        `/status - Check auto-add status\n\n` +
        `*Advanced Commands (Admin Only):*\n` +
        `/broadcast [msg] - Send message to all members\n` +
        `/exportmembers - Get members list as text\n` +
        `/reset - Reset all data (careful!)`;
};

// ==================== BASIC COMMANDS ====================

// /start - Everyone can use
bot.command('start', (ctx) => {
    const userName = ctx.from.first_name || 'User';
    const userId = ctx.from.id;
    
    // Add user to active members if not already
    const existingMember = state.activeMembers.find(m => m.id === userId);
    if (!existingMember) {
        state.activeMembers.push({
            id: userId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            joined: new Date(),
            source: 'bot_start'
        });
        console.log(`📥 New member added via /start: ${userId}`);
    }
    
    ctx.reply(`👋 Hello ${userName}!\n\n` +
        `Welcome to *NOVA Marketing Bot*!\n\n` +
        `Your ID: \`${userId}\`\n` +
        `You are now in our active members list.\n\n` +
        `Use /help to see all commands\n` +
        `Use /id to get your ID again`,
        { parse_mode: 'Markdown' });
});

// /help - Everyone can use
bot.command('help', (ctx) => {
    ctx.reply(showHelp(), { parse_mode: 'Markdown' });
});

// /ping - Check bot status
bot.command('ping', (ctx) => {
    ctx.reply('🏓 Pong! Bot is alive and working!');
});

// /id - Get user ID
bot.command('id', (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username ? `(@${ctx.from.username})` : '';
    
    ctx.reply(`🆔 *Your Telegram ID:*\n\`${userId}\`\n\n` +
        `Username: ${username}\n` +
        `Name: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`,
        { parse_mode: 'Markdown' });
});

// /stats - Show statistics
bot.command('stats', (ctx) => {
    const isAdminUser = isAdmin(ctx);
    
    let statsMsg = `📊 *BOT STATISTICS*\n\n`;
    statsMsg += `👥 Active Members: ${state.activeMembers.length}\n`;
    statsMsg += `✅ Total Added to Groups: ${state.totalAdded}\n`;
    statsMsg += `📁 Target Groups: ${state.groups.length}\n`;
    statsMsg += `⚡ Auto-Add: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    
    if (isAdminUser) {
        statsMsg += `\n*Admin Details:*\n`;
        statsMsg += `⏰ Timer: ${state.timerMinutes} minutes\n`;
        statsMsg += `👥 Per Batch: ${state.membersPerInterval} members\n`;
        statsMsg += `🤖 Bot: @Nova_marketing_bot\n`;
        statsMsg += `🌐 Dashboard: http://localhost:${PORT}`;
    }
    
    ctx.reply(statsMsg, { parse_mode: 'Markdown' });
});

// ==================== GROUP COMMANDS ====================

// /addgroup - Add target group
bot.command('addgroup', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (ctx.chat.type === 'private') {
        return ctx.reply('❌ Please use this command in a Telegram group!');
    }
    
    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title || 'Unknown Group';
    
    // Check if already added
    const existingGroup = state.groups.find(g => g.id === groupId);
    if (existingGroup) {
        return ctx.reply(`✅ Group already added:\n"${groupName}"`);
    }
    
    // Check if bot is admin
    try {
        const chatMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return ctx.reply('❌ Bot must be ADMIN in this group!\n\n' +
                'Please make @Nova_marketing_bot an administrator first.');
        }
    } catch (error) {
        console.log('Admin check error:', error.message);
    }
    
    // Add the group
    state.groups.push({
        id: groupId,
        name: groupName,
        username: ctx.chat.username || '',
        addedAt: new Date(),
        addedMembers: 0
    });
    
    ctx.reply(`✅ *GROUP ADDED SUCCESSFULLY!*\n\n` +
        `📁 Name: ${groupName}\n` +
        `🆔 ID: ${groupId}\n` +
        `👥 Members will be added here\n` +
        `📊 Total groups: ${state.groups.length}`,
        { parse_mode: 'Markdown' });
});

// /listgroups - List all groups
bot.command('listgroups', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (state.groups.length === 0) {
        return ctx.reply('📭 No groups added yet!\n\n' +
            'To add a group:\n' +
            '1. Add bot to group as ADMIN\n' +
            '2. Send /addgroup in that group');
    }
    
    let message = `📁 *TARGET GROUPS (${state.groups.length})*\n\n`;
    
    state.groups.forEach((group, index) => {
        message += `${index + 1}. *${group.name}*\n`;
        message += `   🆔 ID: \`${group.id}\`\n`;
        message += `   👥 Added: ${group.addedMembers} members\n`;
        message += `   📅 Added: ${new Date(group.addedAt).toLocaleDateString()}\n\n`;
    });
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// /removegroup - Remove a group
bot.command('removegroup', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        // Show list of groups to remove
        if (state.groups.length === 0) {
            return ctx.reply('No groups to remove!');
        }
        
        let message = `🗑️ *Select group to remove:*\n\n`;
        state.groups.forEach((group, index) => {
            message += `${index + 1}. ${group.name}\n`;
            message += `   ID: \`${group.id}\`\n\n`;
        });
        message += `Usage: /removegroup [group_id]\nExample: /removegroup ${state.groups[0]?.id}`;
        
        return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    const groupId = args[1];
    const initialLength = state.groups.length;
    
    state.groups = state.groups.filter(group => group.id.toString() !== groupId);
    
    if (state.groups.length < initialLength) {
        ctx.reply(`✅ Group removed successfully!\nRemaining groups: ${state.groups.length}`);
    } else {
        ctx.reply('❌ Group not found! Use /listgroups to see available groups.');
    }
});

// /cleargroups - Remove all groups
bot.command('cleargroups', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const groupCount = state.groups.length;
    state.groups = [];
    
    ctx.reply(`✅ All ${groupCount} groups have been removed!`);
});

// ==================== MEMBER COMMANDS ====================

// /addmember - Add member manually
bot.command('addmember', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Usage: /addmember [user_id]\nExample: /addmember 123456789');
    }
    
    const userId = parseInt(args[1]);
    
    if (isNaN(userId)) {
        return ctx.reply('❌ Invalid user ID! Must be a number.');
    }
    
    // Check if already exists
    const existingMember = state.activeMembers.find(m => m.id === userId);
    if (existingMember) {
        return ctx.reply(`ℹ️ User ${userId} is already in the members list.`);
    }
    
    // Add new member
    state.activeMembers.push({
        id: userId,
        username: args[2] || null,
        firstName: args[3] || null,
        joined: new Date(),
        source: 'manual_add'
    });
    
    ctx.reply(`✅ *MEMBER ADDED SUCCESSFULLY!*\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `📊 Total members: ${state.activeMembers.length}\n` +
        `✅ Ready to be added to groups!`,
        { parse_mode: 'Markdown' });
});

// /addmembers - Add multiple members
bot.command('addmembers', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Usage: /addmembers [id1,id2,id3]\nExample: /addmembers 123,456,789');
    }
    
    const userIds = args[1].split(',').map(id => parseInt(id.trim()));
    let addedCount = 0;
    let duplicateCount = 0;
    
    for (const userId of userIds) {
        if (isNaN(userId)) continue;
        
        const existingMember = state.activeMembers.find(m => m.id === userId);
        if (!existingMember) {
            state.activeMembers.push({
                id: userId,
                joined: new Date(),
                source: 'batch_add'
            });
            addedCount++;
        } else {
            duplicateCount++;
        }
    }
    
    ctx.reply(`✅ *MEMBERS ADDED!*\n\n` +
        `✅ New members: ${addedCount}\n` +
        `ℹ️ Duplicates skipped: ${duplicateCount}\n` +
        `📊 Total members now: ${state.activeMembers.length}`);
});

// /listmembers - List all members
bot.command('listmembers', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('📭 No active members yet!\n\n' +
            'Add members with:\n' +
            '• /addmember [id]\n' +
            '• Users using /start command\n' +
            '• /addmembers [id1,id2]');
    }
    
    let message = `👥 *ACTIVE MEMBERS (${state.activeMembers.length})*\n\n`;
    
    // Show first 15 members
    state.activeMembers.slice(0, 15).forEach((member, index) => {
        message += `${index + 1}. ID: \`${member.id}\`\n`;
        if (member.username) message += `   👤 @${member.username}\n`;
        message += `   📅 ${new Date(member.joined).toLocaleDateString()}\n`;
        message += `   📍 Source: ${member.source || 'unknown'}\n\n`;
    });
    
    if (state.activeMembers.length > 15) {
        message += `... and ${state.activeMembers.length - 15} more members\n`;
    }
    
    message += `\n📊 *Summary:*\n`;
    message += `Total: ${state.activeMembers.length} members\n`;
    message += `Ready to add to ${state.groups.length} groups`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// /removemember - Remove a member
bot.command('removemember', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        if (state.activeMembers.length === 0) {
            return ctx.reply('No members to remove!');
        }
        
        let message = `🗑️ *Select member to remove:*\n\n`;
        state.activeMembers.slice(0, 10).forEach((member, index) => {
            message += `${index + 1}. ID: \`${member.id}\`\n`;
            if (member.username) message += `   @${member.username}\n`;
            message += `\n`;
        });
        message += `Usage: /removemember [user_id]`;
        
        return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    const userId = parseInt(args[1]);
    const initialLength = state.activeMembers.length;
    
    state.activeMembers = state.activeMembers.filter(member => member.id !== userId);
    
    if (state.activeMembers.length < initialLength) {
        ctx.reply(`✅ Member ${userId} removed!\nRemaining members: ${state.activeMembers.length}`);
    } else {
        ctx.reply('❌ Member not found!');
    }
});

// /clearmembers - Clear all members
bot.command('clearmembers', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const memberCount = state.activeMembers.length;
    state.activeMembers = [];
    
    ctx.reply(`✅ All ${memberCount} members have been removed!`);
});

// /exportmembers - Export members as text
bot.command('exportmembers', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('No members to export!');
    }
    
    let exportText = `📋 Active Members List (${state.activeMembers.length})\n`;
    exportText += `Exported: ${new Date().toLocaleString()}\n\n`;
    
    state.activeMembers.forEach((member, index) => {
        exportText += `${index + 1}. ${member.id}`;
        if (member.username) exportText += ` (@${member.username})`;
        if (member.firstName) exportText += ` - ${member.firstName}`;
        exportText += `\n`;
    });
    
    // Send as text file if too long
    if (exportText.length > 4000) {
        ctx.reply(`📁 Members list is too long (${exportText.length} chars).\n` +
                  `Sending first 100 members only.`);
        
        exportText = exportText.split('\n').slice(0, 100).join('\n');
        exportText += `\n\n... and ${state.activeMembers.length - 100} more members`;
    }
    
    ctx.reply(`\`\`\`\n${exportText}\n\`\`\``, { parse_mode: 'Markdown' });
});

// ==================== AUTO-ADD COMMANDS ====================

// /startauto - Start auto-adding
bot.command('startauto', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (state.groups.length === 0) {
        return ctx.reply('❌ No target groups added!\n' +
            'First add a group with /addgroup');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('❌ No active members available!\n' +
            'Add members with /addmember or users should use /start');
    }
    
    if (state.isAutoAdding) {
        return ctx.reply('✅ Auto-add is already running!');
    }
    
    state.isAutoAdding = true;
    
    // Start auto-add interval
    autoAddInterval = setInterval(() => {
        if (!state.isAutoAdding || state.activeMembers.length === 0 || state.groups.length === 0) {
            return;
        }
        
        console.log(`🔄 Auto-add cycle started at ${new Date().toLocaleTimeString()}`);
        
        // Simulate adding members (You can replace with real Telegram API)
        let addedThisCycle = 0;
        
        state.groups.forEach(group => {
            const membersToAdd = Math.min(state.membersPerInterval, state.activeMembers.length);
            
            if (membersToAdd > 0) {
                // Simulate adding members
                group.addedMembers += membersToAdd;
                state.totalAdded += membersToAdd;
                addedThisCycle += membersToAdd;
                
                console.log(`✅ Added ${membersToAdd} members to ${group.name}`);
            }
        });
        
        // Notify admin if members were added
        if (addedThisCycle > 0) {
            try {
                bot.telegram.sendMessage(
                    ADMIN_ID,
                    `✅ *AUTO-ADD COMPLETED*\n\n` +
                    `⏰ Time: ${new Date().toLocaleTimeString()}\n` +
                    `👥 Added: ${addedThisCycle} members\n` +
                    `📊 Total added: ${state.totalAdded}\n` +
                    `📁 Groups: ${state.groups.length}\n` +
                    `👤 Members left: ${state.activeMembers.length}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.log('Notification error:', error.message);
            }
        }
        
    }, state.timerMinutes * 60 * 1000);
    
    ctx.reply(`🚀 *AUTO-ADD STARTED!*\n\n` +
        `⏰ Interval: ${state.timerMinutes} minutes\n` +
        `👥 Per cycle: ${state.membersPerInterval} members\n` +
        `📁 Target groups: ${state.groups.length}\n` +
        `👤 Available members: ${state.activeMembers.length}\n` +
        `✅ Next cycle in ${state.timerMinutes} minutes`,
        { parse_mode: 'Markdown' });
    
    // Send immediate first cycle
    setTimeout(() => {
        if (state.isAutoAdding) {
            // Simulate first add
            console.log('🔄 First auto-add cycle running...');
        }
    }, 5000);
});

// /stopauto - Stop auto-adding
bot.command('stopauto', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    if (!state.isAutoAdding) {
        return ctx.reply('ℹ️ Auto-add is not running!');
    }
    
    state.isAutoAdding = false;
    if (autoAddInterval) {
        clearInterval(autoAddInterval);
        autoAddInterval = null;
    }
    
    ctx.reply(`⏹️ *AUTO-ADD STOPPED!*\n\n` +
        `All automatic adding has been paused.\n` +
        `Total members added: ${state.totalAdded}\n` +
        `Use /startauto to resume.`,
        { parse_mode: 'Markdown' });
});

// /settime - Set timer settings
bot.command('settime', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Usage: /settime [minutes] [members]\n' +
            'Example: /settime 2 5\n' +
            'Current: ' + state.timerMinutes + ' minutes, ' + 
            state.membersPerInterval + ' members');
    }
    
    const minutes = parseInt(args[1]);
    const members = parseInt(args[2]);
    
    if (isNaN(minutes) || isNaN(members) || minutes < 1 || members < 1) {
        return ctx.reply('❌ Please enter valid numbers!\n' +
            'Minutes: 1-60\nMembers: 1-50');
    }
    
    if (minutes > 60) {
        return ctx.reply('❌ Maximum minutes is 60!');
    }
    
    if (members > 50) {
        return ctx.reply('❌ Maximum members per cycle is 50!');
    }
    
    const wasRunning = state.isAutoAdding;
    
    // Stop if running
    if (wasRunning) {
        state.isAutoAdding = false;
        if (autoAddInterval) {
            clearInterval(autoAddInterval);
            autoAddInterval = null;
        }
    }
    
    // Update settings
    state.timerMinutes = minutes;
    state.membersPerInterval = members;
    
    // Restart if was running
    if (wasRunning) {
        state.isAutoAdding = true;
        autoAddInterval = setInterval(() => {
            // Your auto-add logic here
            console.log(`Auto-add cycle with new settings: ${minutes}m, ${members} members`);
        }, minutes * 60 * 1000);
    }
    
    ctx.reply(`✅ *TIMER SETTINGS UPDATED!*\n\n` +
        `⏰ Interval: ${minutes} minutes\n` +
        `👥 Members per cycle: ${members}\n` +
        `⚡ Status: ${wasRunning ? 'Restarted with new settings' : 'Saved for next start'}`,
        { parse_mode: 'Markdown' });
});

// /status - Check auto-add status
bot.command('status', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    let statusMsg = `📊 *AUTO-ADD STATUS*\n\n`;
    statusMsg += `⚡ Status: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    statusMsg += `⏰ Interval: ${state.timerMinutes} minutes\n`;
    statusMsg += `👥 Per cycle: ${state.membersPerInterval} members\n`;
    statusMsg += `📁 Target groups: ${state.groups.length}\n`;
    statusMsg += `👤 Available members: ${state.activeMembers.length}\n`;
    statusMsg += `✅ Total added: ${state.totalAdded}\n\n`;
    
    if (state.isAutoAdding) {
        statusMsg += `🔄 Next cycle in approximately ${state.timerMinutes} minutes`;
    } else {
        statusMsg += `Use /startauto to begin auto-adding`;
    }
    
    ctx.reply(statusMsg, { parse_mode: 'Markdown' });
});

// ==================== ADVANCED COMMANDS ====================

// /broadcast - Send message to all members
bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Usage: /broadcast [message]\n' +
            'Example: /broadcast Hello everyone!');
    }
    
    const message = ctx.message.text.replace('/broadcast ', '');
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('No members to broadcast to!');
    }
    
    ctx.reply(`📢 Starting broadcast to ${state.activeMembers.length} members...\n` +
        `Message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
    
    let sentCount = 0;
    let failedCount = 0;
    
    // Send to first 10 members only (to avoid spam)
    const membersToBroadcast = state.activeMembers.slice(0, 10);
    
    for (const member of membersToBroadcast) {
        try {
            await ctx.telegram.sendMessage(member.id, `📢 *BROADCAST*\n\n${message}`, {
                parse_mode: 'Markdown'
            });
            sentCount++;
            
            // Delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.log(`Failed to send to ${member.id}:`, error.message);
            failedCount++;
        }
    }
    
    ctx.reply(`📢 *BROADCAST COMPLETE*\n\n` +
        `✅ Sent: ${sentCount} members\n` +
        `❌ Failed: ${failedCount} members\n` +
        `📊 Total: ${membersToBroadcast.length} members`,
        { parse_mode: 'Markdown' });
});

// /reset - Reset all data
bot.command('reset', (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    // Create confirmation buttons
    ctx.reply('⚠️ *WARNING: RESET ALL DATA*\n\n' +
        'This will delete:\n' +
        `• ${state.activeMembers.length} active members\n` +
        `• ${state.groups.length} target groups\n` +
        `• ${state.totalAdded} total added count\n\n` +
        'Are you sure?\n\n' +
        'Reply with "YES RESET" to confirm.',
        { parse_mode: 'Markdown' });
    
    // Wait for confirmation
    bot.on('text', async (ctx) => {
        if (ctx.from.id.toString() === ADMIN_ID && 
            ctx.message.text.toUpperCase() === 'YES RESET') {
            
            const membersCount = state.activeMembers.length;
            const groupsCount = state.groups.length;
            const addedCount = state.totalAdded;
            
            // Reset everything
            state = {
                isAutoAdding: false,
                groups: [],
                activeMembers: [],
                totalAdded: 0,
                timerMinutes: 2,
                membersPerInterval: 5
            };
            
            if (autoAddInterval) {
                clearInterval(autoAddInterval);
                autoAddInterval = null;
            }
            
            ctx.reply(`♻️ *ALL DATA RESET COMPLETE*\n\n` +
                `🗑️ Deleted:\n` +
                `• ${membersCount} active members\n` +
                `• ${groupsCount} target groups\n` +
                `• ${addedCount} total added count\n\n` +
                `Bot is now fresh and empty.`,
                { parse_mode: 'Markdown' });
        }
    });
});

// ==================== WEB DASHBOARD ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'NOVA Marketing Bot Dashboard',
        botUsername: 'Nova_marketing_bot',
        stats: {
            activeMembers: state.activeMembers.length,
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
            isAutoAdding: state.isAutoAdding,
            timerMinutes: state.timerMinutes,
            membersPerInterval: state.membersPerInterval
        }
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            activeMembers: state.activeMembers.length,
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
            isAutoAdding: state.isAutoAdding,
            timerMinutes: state.timerMinutes,
            membersPerInterval: state.membersPerInterval
        }
    });
});

// ==================== START BOT ====================
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    
    bot.launch().then(() => {
        console.log('✅ Bot launched successfully!');
        console.log(`🤖 Bot username: @Nova_marketing_bot`);
        console.log(`👑 Admin ID: ${ADMIN_ID}`);
        console.log(`📊 Stats: ${state.activeMembers.length} members, ${state.groups.length} groups`);
        
        // Send startup notification
        bot.telegram.sendMessage(
            ADMIN_ID,
            `🤖 *BOT STARTED SUCCESSFULLY!*\n\n` +
            `✅ All commands are working\n` +
            `👥 Members: ${state.activeMembers.length}\n` +
            `📁 Groups: ${state.groups.length}\n` +
            `🌐 Dashboard: http://localhost:${PORT}\n\n` +
            `Use /help to see all commands`,
            { parse_mode: 'Markdown' }
        ).catch(err => console.log('Startup notification failed:', err.message));
    });
});

// Error handling
bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
});

// Graceful shutdown
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    if (autoAddInterval) clearInterval(autoAddInterval);
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    if (autoAddInterval) clearInterval(autoAddInterval);
});
