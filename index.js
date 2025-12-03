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

// REAL Database for members (In-memory or use MongoDB)
let state = {
    isAutoAdding: false,
    groups: [],
    sourceGroups: [], // Groups to get active members FROM
    totalAdded: 0,
    timerMinutes: 2,
    membersPerInterval: 5,
    activeMembers: [], // REAL Telegram User IDs will be stored here
    lastScanned: null
};

let autoAddInterval = null;

// ==================== REAL FUNCTIONS ====================

// 1. SCAN ACTIVE MEMBERS FROM SOURCE GROUP
const scanActiveMembers = async (sourceGroupId) => {
    console.log(`🔍 Scanning active members from group: ${sourceGroupId}`);
    
    try {
        // Get chat members count
        const membersCount = await bot.telegram.getChatMembersCount(sourceGroupId);
        console.log(`👥 Total members in source: ${membersCount}`);
        
        // Note: Telegram API doesn't allow getting all members directly
        // We need to collect members when they interact
        
        return membersCount;
        
    } catch (error) {
        console.error('Scan error:', error.message);
        return 0;
    }
};

// 2. ADD REAL MEMBER TO TARGET GROUP
const addRealMemberToGroup = async (targetGroupId, userId) => {
    try {
        console.log(`🔄 Adding user ${userId} to group...`);
        
        // REAL Telegram API call to add member
        await bot.telegram.addChatMember(targetGroupId, userId, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: true,
            can_invite_users: true,
            can_pin_messages: false
        });
        
        console.log(`✅ SUCCESS: User ${userId} added to group`);
        return { success: true, userId };
        
    } catch (error) {
        console.error(`❌ FAILED to add ${userId}:`, error.message);
        
        // Common errors and solutions
        if (error.response && error.response.error_code === 400) {
            if (error.response.description.includes('USER_ALREADY_PARTICIPANT')) {
                console.log(`ℹ️ User ${userId} is already in group`);
                return { success: false, reason: 'already_member' };
            }
            if (error.response.description.includes('USER_NOT_MUTUAL_CONTACT')) {
                console.log(`ℹ️ User ${userId} hasn't started the bot`);
                return { success: false, reason: 'not_mutual_contact' };
            }
            if (error.response.description.includes('USER_PRIVACY_RESTRICTED')) {
                console.log(`ℹ️ User ${userId} has privacy restrictions`);
                return { success: false, reason: 'privacy_restricted' };
            }
        }
        
        return { success: false, reason: error.message };
    }
};

// 3. AUTO-ADD REAL MEMBERS
const startAutoAddReal = async () => {
    if (state.isAutoAdding) return;
    
    state.isAutoAdding = true;
    console.log('🚀 REAL Auto-add started - Adding ACTIVE members');
    
    autoAddInterval = setInterval(async () => {
        if (state.groups.length === 0) {
            console.log('No target groups to add members to');
            return;
        }
        
        if (state.activeMembers.length === 0) {
            console.log('No active members available. Collect members first.');
            
            // Notify admin
            try {
                await bot.telegram.sendMessage(
                    ADMIN_ID,
                    '⚠️ No active members available!\n' +
                    'Collect members first using:\n' +
                    '1. /addsourcegroup [group_id]\n' +
                    '2. /scangroup [group_id]\n' +
                    '3. Or add members manually with /addmember [user_id]'
                );
            } catch (err) {
                console.log('Notification error:', err.message);
            }
            
            return;
        }
        
        // Process each target group
        for (const targetGroup of state.groups) {
            console.log(`\n🎯 Processing target group: ${targetGroup.name}`);
            
            let addedThisRound = 0;
            let failedThisRound = 0;
            
            // Add members to this group
            for (let i = 0; i < state.membersPerInterval; i++) {
                if (state.activeMembers.length === 0) break;
                
                const member = state.activeMembers.shift(); // Get and remove first member
                
                if (!member || !member.userId) continue;
                
                const result = await addRealMemberToGroup(targetGroup.id, member.userId);
                
                if (result.success) {
                    addedThisRound++;
                    targetGroup.addedMembers++;
                    state.totalAdded++;
                    
                    // Remove from active members list (already removed with shift())
                } else {
                    failedThisRound++;
                    
                    // If failed for temporary reason, put back at end
                    if (result.reason === 'not_mutual_contact' || 
                        result.reason === 'privacy_restricted') {
                        state.activeMembers.push(member); // Put back at end
                    }
                }
                
                // Delay between adds to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Report for this group
            if (addedThisRound > 0) {
                console.log(`\n📊 Summary for ${targetGroup.name}:`);
                console.log(`✅ Added: ${addedThisRound} members`);
                console.log(`❌ Failed: ${failedThisRound} members`);
                console.log(`📈 Total added to this group: ${targetGroup.addedMembers}`);
                
                // Notify admin
                try {
                    await bot.telegram.sendMessage(
                        ADMIN_ID,
                        `✅ *REAL MEMBERS ADDED*\n\n` +
                        `📁 Group: ${targetGroup.name}\n` +
                        `✅ Added: ${addedThisRound} ACTIVE members\n` +
                        `❌ Failed: ${failedThisRound}\n` +
                        `📊 Total in group: ${targetGroup.addedMembers}\n` +
                        `👥 Remaining: ${state.activeMembers.length} members`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (err) {
                    console.log('Notification error:', err.message);
                }
            }
        }
        
    }, state.timerMinutes * 60 * 1000); // Run every X minutes
};

// ==================== BOT COMMANDS ====================

// 1. ADD SOURCE GROUP (to get members FROM)
bot.command('addsourcegroup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (ctx.chat.type === 'private') {
        return ctx.reply('❌ Use this command in the SOURCE group (where members are)');
    }
    
    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title || 'Unknown Group';
    
    // Check if already added
    const existing = state.sourceGroups.find(g => g.id === groupId);
    if (existing) {
        return ctx.reply(`✅ Source group already added:\n${groupName}`);
    }
    
    // Add source group
    state.sourceGroups.push({
        id: groupId,
        name: groupName,
        username: ctx.chat.username || '',
        memberCount: 0,
        addedAt: new Date()
    });
    
    ctx.reply(`✅ *SOURCE GROUP Added!*\n\n` +
        `📁 Name: ${groupName}\n` +
        `🎯 This group will be scanned for ACTIVE members\n` +
        `👥 Members will be added to target groups\n\n` +
        `Now collect members with /scangroup`,
        { parse_mode: 'Markdown' });
});

// 2. SCAN GROUP FOR ACTIVE MEMBERS
bot.command('scangroup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    const args = ctx.message.text.split(' ');
    let groupId;
    
    if (args.length > 1) {
        groupId = args[1];
    } else if (ctx.chat.type !== 'private') {
        groupId = ctx.chat.id;
    } else {
        return ctx.reply('Usage: /scangroup [group_id] or use in a group');
    }
    
    ctx.reply('🔍 Scanning group for active members... (This may take a while)');
    
    try {
        // Get group info
        const chat = await ctx.telegram.getChat(groupId);
        const membersCount = await ctx.telegram.getChatMembersCount(groupId);
        
        ctx.reply(`📊 *Group Scan Results*\n\n` +
            `📁 Group: ${chat.title}\n` +
            `👥 Total Members: ${membersCount}\n\n` +
            `*How to collect members:*\n` +
            `1. Ask members to START this bot: @Nova_marketing_bot\n` +
            `2. Or use /addmember [user_id] manually\n` +
            `3. Share bot link in group: t.me/Nova_marketing_bot`,
            { parse_mode: 'Markdown' });
            
    } catch (error) {
        ctx.reply(`❌ Error scanning group: ${error.message}`);
    }
});

// 3. ADD MEMBER MANUALLY
bot.command('addmember', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Usage: /addmember [user_id]\nExample: /addmember 123456789');
    }
    
    const userId = parseInt(args[1]);
    
    if (isNaN(userId)) {
        return ctx.reply('❌ Invalid user ID! Must be a number.');
    }
    
    // Check if already in list
    const existing = state.activeMembers.find(m => m.userId === userId);
    if (existing) {
        return ctx.reply(`ℹ️ User ${userId} is already in active members list`);
    }
    
    // Add to active members
    state.activeMembers.push({
        userId: userId,
        addedAt: new Date(),
        source: 'manual'
    });
    
    ctx.reply(`✅ *ACTIVE MEMBER ADDED*\n\n` +
        `👤 User ID: ${userId}\n` +
        `📊 Total active members: ${state.activeMembers.length}\n` +
        `✅ Ready to be added to groups!`,
        { parse_mode: 'Markdown' });
});

// 4. COLLECT MEMBERS WHEN THEY START BOT
bot.on('message', async (ctx) => {
    // When user sends /start or any message, collect their ID
    if (ctx.from && ctx.from.id && ctx.chat.type === 'private') {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'No username';
        
        // Check if already in list
        const existing = state.activeMembers.find(m => m.userId === userId);
        if (!existing) {
            state.activeMembers.push({
                userId: userId,
                username: username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                addedAt: new Date(),
                source: 'bot_start'
            });
            
            console.log(`📥 New active member collected: ${userId} (@${username})`);
            
            // Thank them
            if (ctx.message.text === '/start') {
                ctx.reply(`🤝 *Thanks for starting Nova Marketing Bot!*\n\n` +
                    `✅ Your ID has been added to our ACTIVE members list\n` +
                    `👤 Your ID: ${userId}\n` +
                    `📊 You may be added to premium Telegram groups\n` +
                    `🙏 Thank you for your participation!`,
                    { parse_mode: 'Markdown' });
            }
            
            // Notify admin
            try {
                await bot.telegram.sendMessage(
                    ADMIN_ID,
                    `📥 *NEW ACTIVE MEMBER*\n\n` +
                    `👤 User: @${username} (${ctx.from.first_name})\n` +
                    `🆔 ID: ${userId}\n` +
                    `📊 Total active: ${state.activeMembers.length}\n` +
                    `✅ Ready to add to groups!`,
                    { parse_mode: 'Markdown' }
                );
            } catch (err) {
                console.log('Admin notification error:', err.message);
            }
        }
    }
});

// 5. LIST ACTIVE MEMBERS
bot.command('listmembers', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('📭 No active members yet!\n\n' +
            'To get active members:\n' +
            '1. Share bot link: t.me/Nova_marketing_bot\n' +
            '2. Ask users to START the bot\n' +
            '3. Or use /addmember [user_id]');
    }
    
    let message = `📋 *ACTIVE MEMBERS (${state.activeMembers.length})*\n\n`;
    
    // Show first 20 members
    state.activeMembers.slice(0, 20).forEach((member, index) => {
        message += `${index + 1}. ID: ${member.userId}\n`;
        if (member.username) message += `   👤 @${member.username}\n`;
        if (member.firstName) message += `   👋 ${member.firstName}\n`;
        message += `   📅 ${new Date(member.addedAt).toLocaleDateString()}\n\n`;
    });
    
    if (state.activeMembers.length > 20) {
        message += `... and ${state.activeMembers.length - 20} more members\n`;
    }
    
    message += `\n📊 *Stats:*\n`;
    message += `Total Active: ${state.activeMembers.length}\n`;
    message += `Target Groups: ${state.groups.length}\n`;
    message += `Already Added: ${state.totalAdded}`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// 6. START REAL AUTO-ADD
bot.command('startauto', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (state.groups.length === 0) {
        return ctx.reply('❌ No target groups added!\nUse /addgroup in a target group first');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('❌ No active members available!\n\n' +
            'Collect active members first:\n' +
            '1. Share bot: t.me/Nova_marketing_bot\n' +
            '2. Users START the bot\n' +
            '3. Or add manually: /addmember [id]\n' +
            'Current members: 0');
    }
    
    // Start REAL auto-add
    startAutoAddReal();
    
    ctx.reply(`🚀 *REAL AUTO-ADD STARTED!*\n\n` +
        `⏰ Interval: ${state.timerMinutes} minutes\n` +
        `👥 Per Interval: ${state.membersPerInterval} members\n` +
        `📁 Target Groups: ${state.groups.length}\n` +
        `👤 Active Members: ${state.activeMembers.length}\n` +
        `✅ Already Added: ${state.totalAdded}\n\n` +
        `*Bot will add REAL ACTIVE members to your groups!*`,
        { parse_mode: 'Markdown' });
});

// 7. ADD TARGET GROUP (where to add members TO)
bot.command('addgroup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (ctx.chat.type === 'private') {
        return ctx.reply('❌ Please use this command in the TARGET group (where to add members)');
    }
    
    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title || 'Unknown Group';
    
    // Check if bot is admin
    try {
        const chatMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return ctx.reply('❌ *Bot must be ADMIN in this group!*\n\n' +
                'Please make @Nova_marketing_bot an admin with:\n' +
                '✅ Add members permission\n' +
                '✅ Send messages permission\n' +
                'Then try again.', { parse_mode: 'Markdown' });
        }
    } catch (error) {
        return ctx.reply('❌ Cannot verify bot admin status: ' + error.message);
    }
    
    // Check if already added
    const existing = state.groups.find(g => g.id === groupId);
    if (existing) {
        return ctx.reply(`✅ Group already added as TARGET:\n${groupName}`);
    }
    
    // Add target group
    state.groups.push({
        id: groupId,
        name: groupName,
        username: ctx.chat.username || '',
        addedMembers: 0,
        addedAt: new Date(),
        isActive: true
    });
    
    ctx.reply(`✅ *TARGET GROUP Added!*\n\n` +
        `📁 Name: ${groupName}\n` +
        `✅ Bot admin: Verified ✓\n` +
        `🎯 ACTIVE members will be added here\n` +
        `⏰ Every ${state.timerMinutes} minutes\n` +
        `👥 ${state.membersPerInterval} members per interval\n\n` +
        `*Next steps:*\n` +
        `1. Collect members with bot\n` +
        `2. Start auto-add: /startauto`,
        { parse_mode: 'Markdown' });
});

// 8. STATS COMMAND
bot.command('stats', (ctx) => {
    const isAdmin = ctx.from.id.toString() === ADMIN_ID;
    
    let message = `📊 *NOVA MARKETING BOT - REAL STATS*\n\n`;
    message += `⚡ Status: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    message += `👥 Active Members: ${state.activeMembers.length}\n`;
    message += `✅ Total Added: ${state.totalAdded} REAL members\n`;
    message += `📁 Target Groups: ${state.groups.length}\n`;
    message += `📥 Source Groups: ${state.sourceGroups.length}\n`;
    message += `⏰ Timer: ${state.timerMinutes}m / ${state.membersPerInterval}👥\n\n`;
    
    if (isAdmin) {
        message += `*Admin Quick Actions:*\n`;
        message += `🎯 /addgroup - Add target group\n`;
        message += `📥 /addsourcegroup - Add source group\n`;
        message += `👥 /listmembers - Show active members\n`;
        message += `🚀 /startauto - Start adding REAL members\n`;
        message += `⏹️ /stopauto - Stop\n`;
        message += `📊 /stats - This menu\n`;
    }
    
    message += `\n🌐 Web Dashboard: http://localhost:${PORT}`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// 9. STOP AUTO-ADD
bot.command('stopauto', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (autoAddInterval) {
        clearInterval(autoAddInterval);
        autoAddInterval = null;
    }
    state.isAutoAdding = false;
    
    ctx.reply('⏹️ *REAL Auto-add STOPPED!*\n\n' +
        'All active member adding has been paused.\n' +
        'Use /startauto to resume.',
        { parse_mode: 'Markdown' });
});

// ==================== WEB DASHBOARD ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Dashboard
app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'Telegram REAL Member Adder',
        botUsername: 'Nova_marketing_bot',
        stats: {
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
            activeMembers: state.activeMembers.length,
            isAutoAdding: state.isAutoAdding,
            timerMinutes: state.timerMinutes,
            membersPerInterval: state.membersPerInterval,
            sourceGroups: state.sourceGroups.length
        },
        groups: state.groups,
        activeMembers: state.activeMembers.slice(0, 50) // Show first 50
    });
});

// API endpoints for dashboard
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
            activeMembers: state.activeMembers.length,
            isAutoAdding: state.isAutoAdding,
            timerMinutes: state.timerMinutes,
            membersPerInterval: state.membersPerInterval,
            uptime: process.uptime()
        }
    });
});

app.post('/api/control', (req, res) => {
    const { action } = req.body;
    
    if (action === 'start') {
        if (state.groups.length === 0) {
            return res.json({ success: false, message: 'No target groups!' });
        }
        if (state.activeMembers.length === 0) {
            return res.json({ success: false, message: 'No active members!' });
        }
        
        startAutoAddReal();
        res.json({ success: true, message: 'REAL Auto-add started!' });
    } 
    else if (action === 'stop') {
        if (autoAddInterval) clearInterval(autoAddInterval);
        state.isAutoAdding = false;
        res.json({ success: true, message: 'Auto-add stopped!' });
    }
    else {
        res.json({ success: false, message: 'Invalid action' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
    console.log(`🤖 Bot: @Nova_marketing_bot`);
    console.log(`👑 Admin: @NOVA_X_TEAM (${ADMIN_ID})`);
    
    bot.launch().then(() => {
        console.log('✅ Bot launched successfully!');
        console.log(`📊 Active members ready: ${state.activeMembers.length}`);
        console.log(`🎯 Target groups: ${state.groups.length}`);
        
        // Initial notification to admin
        bot.telegram.sendMessage(
            ADMIN_ID,
            `🤖 *NOVA MARKETING BOT STARTED*\n\n` +
            `✅ Bot is online and ready!\n` +
            `👥 Active members: ${state.activeMembers.length}\n` +
            `📁 Target groups: ${state.groups.length}\n` +
            `🌐 Dashboard: http://localhost:${PORT}\n\n` +
            `*Quick Start:*\n` +
            `1. Add bot to target group as ADMIN\n` +
            `2. In group: /addgroup\n` +
            `3. Share bot link to collect members\n` +
            `4. /startauto to begin`,
            { parse_mode: 'Markdown' }
        ).catch(err => console.log('Initial notification failed:', err.message));
    });
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGINT');
    if (autoAddInterval) clearInterval(autoAddInterval);
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGTERM');
    if (autoAddInterval) clearInterval(autoAddInterval);
});
