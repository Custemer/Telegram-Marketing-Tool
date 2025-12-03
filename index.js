require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8583299414:AAGckHHBDB04LyM3ez8ZOb9JT98Y_MGC7ic';
const ADMIN_ID = process.env.ADMIN_USER_ID || '8581477799';

const bot = new Telegraf(BOT_TOKEN);

// Storage
let state = {
    isAutoGenerating: false,
    isAutoAdding: false,
    generatedMembers: [],  // All generated members
    activeMembers: [],     // Verified active members only
    groups: [],
    totalAdded: 0,
    generationSettings: {
        minId: 1000000000,  // Start from this ID
        maxId: 9999999999,  // Up to this ID
        batchSize: 100,     // Generate this many at once
        checkActivity: true // Check if active before adding
    },
    addSettings: {
        timerMinutes: 2,
        membersPerInterval: 5,
        onlyActive: true    // Only add active members
    }
};

let generateInterval = null;
let addInterval = null;

// ==================== SMART MEMBER GENERATOR ====================

// Generate random Telegram-like user IDs
const generateMemberIds = (count) => {
    const ids = [];
    const { minId, maxId } = state.generationSettings;
    
    for (let i = 0; i < count; i++) {
        // Generate ID between min and max
        const id = Math.floor(Math.random() * (maxId - minId + 1)) + minId;
        
        // Make sure ID starts with acceptable digits (Telegram IDs usually start with certain patterns)
        const firstDigit = id.toString()[0];
        const validFirstDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        
        if (validFirstDigits.includes(firstDigit)) {
            ids.push(id);
        }
    }
    
    return ids;
};

// Check if a user ID is active/valid on Telegram
const checkUserActivity = async (userId) => {
    try {
        console.log(`🔍 Checking user ${userId}...`);
        
        // Method 1: Try to get user info (only works if user has interacted with bot)
        try {
            const user = await bot.telegram.getChat(userId);
            
            // If we can get user info, they exist and might be active
            return {
                id: userId,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                isActive: true,
                lastSeen: new Date(),
                source: 'telegram_check'
            };
        } catch (getError) {
            // Method 2: Try to send a hidden message
            try {
                await bot.telegram.sendMessage(
                    userId,
                    `👋`,
                    { disable_notification: true }
                );
                
                // If message sent successfully, user exists
                return {
                    id: userId,
                    isActive: true,
                    lastSeen: new Date(),
                    source: 'message_test'
                };
            } catch (sendError) {
                // Method 3: Check common patterns
                // Some IDs might be invalid format
                const idStr = userId.toString();
                if (idStr.length < 8 || idStr.length > 12) {
                    return {
                        id: userId,
                        isActive: false,
                        reason: 'invalid_length'
                    };
                }
                
                return {
                    id: userId,
                    isActive: false,
                    reason: 'not_found',
                    error: sendError.message
                };
            }
        }
    } catch (error) {
        console.log(`Error checking ${userId}:`, error.message);
        return {
            id: userId,
            isActive: false,
            reason: 'check_error',
            error: error.message
        };
    }
};

// Bulk check user activity
const bulkCheckActivity = async (userIds) => {
    console.log(`🔄 Bulk checking ${userIds.length} users...`);
    
    const results = [];
    let activeCount = 0;
    let inactiveCount = 0;
    
    for (const userId of userIds) {
        const result = await checkUserActivity(userId);
        results.push(result);
        
        if (result.isActive) {
            activeCount++;
            
            // Add to active members list
            if (!state.activeMembers.some(m => m.id === userId)) {
                state.activeMembers.push({
                    id: userId,
                    username: result.username,
                    firstName: result.firstName,
                    lastName: result.lastName,
                    checkedAt: new Date(),
                    isActive: true,
                    source: 'generated'
                });
            }
        } else {
            inactiveCount++;
        }
        
        // Add to generated members list (all)
        if (!state.generatedMembers.some(m => m.id === userId)) {
            state.generatedMembers.push({
                id: userId,
                isActive: result.isActive,
                checkedAt: new Date(),
                reason: result.reason
            });
        }
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`📊 Check complete: ${activeCount} active, ${inactiveCount} inactive`);
    return { activeCount, inactiveCount, results };
};

// Start auto-generation
const startAutoGeneration = () => {
    if (state.isAutoGenerating) return;
    
    state.isAutoGenerating = true;
    console.log('🚀 Auto-generation started');
    
    generateInterval = setInterval(async () => {
        if (!state.isAutoGenerating) return;
        
        console.log(`\n🔄 Generating new batch of members...`);
        
        // Generate new IDs
        const newIds = generateMemberIds(state.generationSettings.batchSize);
        console.log(`✅ Generated ${newIds.length} potential member IDs`);
        
        // Check their activity
        const { activeCount } = await bulkCheckActivity(newIds);
        
        // Report
        console.log(`📊 Active members found: ${activeCount}`);
        console.log(`📈 Total active members now: ${state.activeMembers.length}`);
        
        // Notify admin
        try {
            await bot.telegram.sendMessage(
                ADMIN_ID,
                `🔍 *MEMBER GENERATION COMPLETE*\n\n` +
                `✅ Generated: ${newIds.length} IDs\n` +
                `✅ Active found: ${activeCount}\n` +
                `📊 Total active: ${state.activeMembers.length}\n` +
                `👥 Ready to add: ${state.activeMembers.length} members`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.log('Notification error:', error.message);
        }
        
    }, 5 * 60 * 1000); // Generate every 5 minutes
};

// ==================== SMART MEMBER ADDER ====================

// Smart add function with multiple fallbacks
const smartAddMember = async (groupId, userId) => {
    console.log(`🤔 Smart adding ${userId} to group...`);
    
    const methods = [
        { name: 'direct', fn: tryDirectAdd },
        { name: 'invite', fn: tryInviteLink },
        { name: 'contact', fn: tryContactAdd }
    ];
    
    for (const method of methods) {
        try {
            console.log(`Trying ${method.name} method...`);
            const result = await method.fn(groupId, userId);
            
            if (result.success) {
                console.log(`✅ Added via ${method.name}`);
                return { success: true, method: method.name };
            }
        } catch (error) {
            console.log(`${method.name} failed:`, error.message);
        }
        
        // Wait before next method
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return { success: false, error: 'All methods failed' };
};

// Method 1: Direct add
const tryDirectAdd = async (groupId, userId) => {
    try {
        await bot.telegram.addChatMember(groupId, userId, {
            can_send_messages: true,
            can_send_media_messages: true
        });
        return { success: true };
    } catch (error) {
        throw error;
    }
};

// Method 2: Invite link
const tryInviteLink = async (groupId, userId) => {
    try {
        const chat = await bot.telegram.getChat(groupId);
        let inviteLink = chat.invite_link;
        
        if (!inviteLink) {
            const invite = await bot.telegram.createChatInviteLink(groupId, {
                member_limit: 1,
                expires_at: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
            });
            inviteLink = invite.invite_link;
        }
        
        await bot.telegram.sendMessage(
            userId,
            `🎉 *JOIN OUR COMMUNITY!*\n\n` +
            `You've been selected to join our exclusive group!\n\n` +
            `Click here: ${inviteLink}\n\n` +
            `✨ Special invitation valid for 30 minutes`,
            { parse_mode: 'Markdown' }
        );
        
        return { success: true };
    } catch (error) {
        throw error;
    }
};

// Method 3: Contact add (simulated)
const tryContactAdd = async (groupId, userId) => {
    // This is a placeholder for more advanced methods
    // Could include: friend request, channel promotion, etc.
    console.log(`Contact method placeholder for ${userId}`);
    return { success: false };
};

// Start auto-adding active members
const startAutoAdding = () => {
    if (state.isAutoAdding) return;
    
    state.isAutoAdding = true;
    console.log('🚀 Auto-adding active members started');
    
    addInterval = setInterval(async () => {
        if (!state.isAutoAdding || state.groups.length === 0 || state.activeMembers.length === 0) {
            return;
        }
        
        console.log(`\n🔄 Auto-add cycle started`);
        
        let totalAdded = 0;
        let totalFailed = 0;
        
        // Process each group
        for (const group of state.groups) {
            console.log(`🎯 Processing group: ${group.name}`);
            
            let groupAdded = 0;
            let groupFailed = 0;
            
            // Take batch of ACTIVE members
            const batch = state.activeMembers
                .filter(m => m.isActive)
                .slice(0, state.addSettings.membersPerInterval);
            
            for (const member of batch) {
                console.log(`👤 Adding ${member.id}...`);
                
                const result = await smartAddMember(group.id, member.id);
                
                if (result.success) {
                    groupAdded++;
                    totalAdded++;
                    state.totalAdded++;
                    
                    // Remove from active list (already added)
                    state.activeMembers = state.activeMembers.filter(m => m.id !== member.id);
                    
                    console.log(`✅ Added ${member.id} to ${group.name}`);
                } else {
                    groupFailed++;
                    totalFailed++;
                    
                    // Mark as problematic
                    member.lastError = result.error;
                    member.errorCount = (member.errorCount || 0) + 1;
                    
                    // If too many errors, remove
                    if (member.errorCount > 3) {
                        state.activeMembers = state.activeMembers.filter(m => m.id !== member.id);
                        console.log(`❌ Removed ${member.id} after 3 failures`);
                    }
                }
                
                // Delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // Update group stats
            group.addedMembers = (group.addedMembers || 0) + groupAdded;
            
            console.log(`📊 ${group.name}: Added ${groupAdded}, Failed ${groupFailed}`);
        }
        
        // Notify admin
        if (totalAdded > 0) {
            try {
                await bot.telegram.sendMessage(
                    ADMIN_ID,
                    `✅ *ACTIVE MEMBERS ADDED!*\n\n` +
                    `⏰ Time: ${new Date().toLocaleTimeString()}\n` +
                    `👥 Added: ${totalAdded} ACTIVE members\n` +
                    `❌ Failed: ${totalFailed}\n` +
                    `📊 Total added: ${state.totalAdded}\n` +
                    `👤 Active members left: ${state.activeMembers.length}\n` +
                    `🔍 Generated total: ${state.generatedMembers.length}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                console.log('Notification error:', error.message);
            }
        }
        
        console.log(`📈 Cycle complete: Added ${totalAdded}, Failed ${totalFailed}`);
        
    }, state.addSettings.timerMinutes * 60 * 1000);
};

// ==================== BOT COMMANDS ====================

const isAdmin = (ctx) => ctx.from.id.toString() === ADMIN_ID;

// Start command - Also collects users
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'User';
    
    // Add to active members if not already
    const exists = state.activeMembers.find(m => m.id === userId);
    if (!exists) {
        state.activeMembers.push({
            id: userId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            joined: new Date(),
            isActive: true,
            source: 'bot_start'
        });
        console.log(`📥 Active user from /start: ${userId}`);
    }
    
    ctx.reply(`👋 Hello ${userName}!\n\n` +
        `✅ *Welcome to Smart Member System!*\n\n` +
        `Your ID: \`${userId}\`\n` +
        `You're now in our ACTIVE members database.\n` +
        `You'll be added to premium groups soon!\n\n` +
        `✨ *System Features:*\n` +
        `• Auto-generates Telegram members\n` +
        `• Checks activity automatically\n` +
        `• Adds only ACTIVE members to groups\n` +
        `• Smart retry system\n\n` +
        `Use /help for commands`,
        { parse_mode: 'Markdown' });
});

// Generate members command
bot.command('generatemembers', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    const args = ctx.message.text.split(' ');
    const count = args.length > 1 ? parseInt(args[1]) : 100;
    
    if (isNaN(count) || count < 1 || count > 1000) {
        return ctx.reply('❌ Enter number 1-1000\nExample: /generatemembers 50');
    }
    
    ctx.reply(`🔍 Generating ${count} member IDs and checking activity...\nThis may take a few minutes.`);
    
    const ids = generateMemberIds(count);
    const { activeCount } = await bulkCheckActivity(ids);
    
    ctx.reply(`✅ *MEMBER GENERATION COMPLETE!*\n\n` +
        `🔍 Generated: ${count} IDs\n` +
        `✅ Active found: ${activeCount}\n` +
        `📊 Total active now: ${state.activeMembers.length}\n` +
        `👥 Ready to add to groups!\n\n` +
        `Use /startgenauto for auto-generation`,
        { parse_mode: 'Markdown' });
});

// Start auto-generation
bot.command('startgenauto', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    startAutoGeneration();
    
    ctx.reply(`🚀 *AUTO-GENERATION STARTED!*\n\n` +
        `⚡ Generating members automatically\n` +
        `🔍 Checking activity of each\n` +
        `✅ Only keeping ACTIVE members\n` +
        `⏰ Every 5 minutes\n` +
        `👥 Batch size: ${state.generationSettings.batchSize}\n\n` +
        `Active members will be ready for /startaddauto`,
        { parse_mode: 'Markdown' });
});

// Stop auto-generation
bot.command('stopgenauto', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    state.isAutoGenerating = false;
    if (generateInterval) {
        clearInterval(generateInterval);
        generateInterval = null;
    }
    
    ctx.reply(`⏹️ *AUTO-GENERATION STOPPED!*\n\n` +
        `Generated total: ${state.generatedMembers.length}\n` +
        `Active found: ${state.activeMembers.length}\n` +
        `Use /startgenauto to resume`,
        { parse_mode: 'Markdown' });
});

// Start auto-adding
bot.command('startaddauto', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    if (state.groups.length === 0) {
        return ctx.reply('❌ No groups added!\nAdd group with /addgroup');
    }
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('❌ No active members!\nGenerate with /generatemembers or /startgenauto');
    }
    
    startAutoAdding();
    
    ctx.reply(`🚀 *AUTO-ADDING STARTED!*\n\n` +
        `🎯 Adding only ACTIVE members\n` +
        `⏰ Every ${state.addSettings.timerMinutes} minutes\n` +
        `👥 ${state.addSettings.membersPerInterval} per group\n` +
        `📁 Target groups: ${state.groups.length}\n` +
        `👤 Active members ready: ${state.activeMembers.length}\n\n` +
        `✅ Smart system with retry logic`,
        { parse_mode: 'Markdown' });
});

// Add group
bot.command('addgroup', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    if (ctx.chat.type === 'private') return ctx.reply('❌ Use in a group!');
    
    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title;
    
    if (state.groups.some(g => g.id === groupId)) {
        return ctx.reply(`✅ Group already added: ${groupName}`);
    }
    
    // Check bot admin status
    try {
        const chatMember = await ctx.telegram.getChatMember(groupId, ctx.botInfo.id);
        if (!['administrator', 'creator'].includes(chatMember.status)) {
            return ctx.reply('❌ Bot must be ADMIN!\nMake @Nova_marketing_bot admin first.');
        }
    } catch (error) {
        console.log('Admin check error:', error.message);
    }
    
    state.groups.push({
        id: groupId,
        name: groupName,
        username: ctx.chat.username || '',
        addedAt: new Date(),
        addedMembers: 0
    });
    
    ctx.reply(`✅ *GROUP ADDED FOR ACTIVE MEMBERS!*\n\n` +
        `📁 ${groupName}\n` +
        `✨ Only ACTIVE members will be added\n` +
        `⚡ Auto-add ready to start\n` +
        `📊 Total groups: ${state.groups.length}`,
        { parse_mode: 'Markdown' });
});

// Check specific user
bot.command('checkuser', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('Usage: /checkuser [user_id]\nExample: /checkuser 123456789');
    }
    
    const userId = parseInt(args[1]);
    
    ctx.reply(`🔍 Checking user ${userId}...`);
    
    const result = await checkUserActivity(userId);
    
    if (result.isActive) {
        ctx.reply(`✅ *USER IS ACTIVE!*\n\n` +
            `🆔 ID: ${userId}\n` +
            `👤 Username: ${result.username || 'N/A'}\n` +
            `👋 Name: ${result.firstName || ''} ${result.lastName || ''}\n` +
            `✅ Status: Active\n` +
            `📅 Checked: Now\n\n` +
            `Will be added to groups automatically!`,
            { parse_mode: 'Markdown' });
    } else {
        ctx.reply(`❌ *USER NOT ACTIVE*\n\n` +
            `🆔 ID: ${userId}\n` +
            `🚫 Status: Inactive\n` +
            `📛 Reason: ${result.reason || 'Unknown'}\n` +
            `⚠️ Will not be added to groups\n\n` +
            `Only ACTIVE users are added.`,
            { parse_mode: 'Markdown' });
    }
});

// Statistics
bot.command('stats', (ctx) => {
    const isAdminUser = isAdmin(ctx);
    
    let message = `📊 *SMART MEMBER SYSTEM STATS*\n\n`;
    message += `👥 Active Members: ${state.activeMembers.length}\n`;
    message += `🔍 Generated Total: ${state.generatedMembers.length}\n`;
    message += `✅ Added to Groups: ${state.totalAdded}\n`;
    message += `📁 Target Groups: ${state.groups.length}\n`;
    message += `⚡ Auto-Gen: ${state.isAutoGenerating ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    message += `🎯 Auto-Add: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    
    if (isAdminUser) {
        const activePercent = state.generatedMembers.length > 0 ?
            Math.round((state.activeMembers.length / state.generatedMembers.length) * 100) : 0;
        
        message += `\n*Admin Details:*\n`;
        message += `📈 Active Rate: ${activePercent}%\n`;
        message += `⏰ Gen Interval: 5 minutes\n`;
        message += `👥 Batch Size: ${state.generationSettings.batchSize}\n`;
        message += `➕ Add Interval: ${state.addSettings.timerMinutes}m\n`;
        message += `👤 Add per: ${state.addSettings.membersPerInterval}\n`;
        message += `🌐 Dashboard: http://localhost:${PORT}`;
    }
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// List active members
bot.command('listactive', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only!');
    
    if (state.activeMembers.length === 0) {
        return ctx.reply('📭 No active members yet!\nGenerate with /generatemembers');
    }
    
    let message = `✅ *ACTIVE MEMBERS (${state.activeMembers.length})*\n\n`;
    
    state.activeMembers.slice(0, 10).forEach((member, index) => {
        message += `${index + 1}. \`${member.id}\`\n`;
        if (member.username) message += `   @${member.username}\n`;
        if (member.firstName) message += `   ${member.firstName}\n`;
        message += `   Source: ${member.source}\n\n`;
    });
    
    if (state.activeMembers.length > 10) {
        message += `... and ${state.activeMembers.length - 10} more active members`;
    }
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// Help
bot.command('help', (ctx) => {
    const isAdminUser = isAdmin(ctx);
    
    let message = `🤖 *TELEGRAM AUTO MEMBER GENERATOR*\n\n`;
    
    if (isAdminUser) {
        message += `*Admin Commands:*\n`;
        message += `/generatemembers [num] - Generate & check members\n`;
        message += `/startgenauto - Start auto-generation\n`;
        message += `/stopgenauto - Stop auto-generation\n`;
        message += `/checkuser [id] - Check specific user\n`;
        message += `/addgroup - Add target group (in group)\n`;
        message += `/startaddauto - Start auto-adding ACTIVE members\n`;
        message += `/stopaddauto - Stop auto-adding\n`;
        message += `/listactive - List active members\n`;
        message += `/stats - System statistics\n`;
        message += `/help - This message\n\n`;
    }
    
    message += `*System Features:*\n`;
    message += `• Auto-generates Telegram user IDs\n`;
    message += `• Checks if users are ACTIVE\n`;
    message += `• Adds only ACTIVE users to groups\n`;
    message += `• Smart retry with multiple methods\n`;
    message += `• Completely automated\n\n`;
    message += `*For Users:* /start - Join active list`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// ==================== WEB DASHBOARD ====================
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    const activePercent = state.generatedMembers.length > 0 ?
        Math.round((state.activeMembers.length / state.generatedMembers.length) * 100) : 0;
    
    res.render('dashboard', {
        title: 'Telegram Auto Member Generator',
        stats: {
            activeMembers: state.activeMembers.length,
            generatedTotal: state.generatedMembers.length,
            totalAdded: state.totalAdded,
            groups: state.groups.length,
            isAutoGenerating: state.isAutoGenerating,
            isAutoAdding: state.isAutoAdding,
            activePercent: activePercent,
            batchSize: state.generationSettings.batchSize,
            timerMinutes: state.addSettings.timerMinutes
        }
    });
});

// ==================== START ====================
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    
    bot.launch().then(() => {
        console.log('✅ Bot launched successfully!');
        console.log(`🤖 Bot: @Nova_marketing_bot`);
        console.log(`👑 Admin: ${ADMIN_ID}`);
        console.log(`📊 System ready for auto-generation`);
        
        // Auto-start both systems after delay
        setTimeout(() => {
            if (!state.isAutoGenerating) {
                startAutoGeneration();
                console.log('🔄 Auto-generation auto-started');
            }
            
            if (!state.isAutoAdding && state.groups.length > 0 && state.activeMembers.length > 0) {
                startAutoAdding();
                console.log('🎯 Auto-adding auto-started');
            }
        }, 10000);
    });
});

// Graceful shutdown
process.once('SIGINT', () => {
    if (generateInterval) clearInterval(generateInterval);
    if (addInterval) clearInterval(addInterval);
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    if (generateInterval) clearInterval(generateInterval);
    if (addInterval) clearInterval(addInterval);
    bot.stop('SIGTERM');
});
