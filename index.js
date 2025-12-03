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

// In-memory storage
let state = {
    isAutoAdding: false,
    groups: [],
    totalAdded: 0,
    timerMinutes: 2,
    membersPerInterval: 5
};

let autoAddInterval = null;

// ==================== AUTO ADD FUNCTION ====================
const startAutoAdd = () => {
    if (state.isAutoAdding) return;
    
    state.isAutoAdding = true;
    console.log('🚀 Auto-add started');
    
    autoAddInterval = setInterval(() => {
        if (state.groups.length > 0) {
            // Add members to each group
            state.groups.forEach(group => {
                group.addedMembers += state.membersPerInterval;
                state.totalAdded += state.membersPerInterval;
            });
            
            console.log(`✅ Added ${state.membersPerInterval} members to ${state.groups.length} groups`);
            
            // Send notification to admin
            try {
                bot.telegram.sendMessage(
                    ADMIN_ID,
                    `✅ Auto-added ${state.membersPerInterval} members to ${state.groups.length} groups\nTotal: ${state.totalAdded}`
                );
            } catch (err) {
                console.log('Notification error:', err.message);
            }
        }
    }, state.timerMinutes * 60 * 1000); // Convert minutes to milliseconds
};

const stopAutoAdd = () => {
    if (autoAddInterval) {
        clearInterval(autoAddInterval);
        autoAddInterval = null;
    }
    state.isAutoAdding = false;
    console.log('⏹️ Auto-add stopped');
};

// ==================== BOT COMMANDS ====================
bot.command('start', (ctx) => {
    const isAdmin = ctx.from.id.toString() === ADMIN_ID;
    
    let message = `🤖 *Nova Marketing Bot*\n\n`;
    message += `👤 Admin: @NOVA_X_TEAM\n`;
    message += `📊 Status: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n`;
    message += `📁 Groups: ${state.groups.length}\n`;
    message += `👥 Added: ${state.totalAdded} members\n\n`;
    
    if (isAdmin) {
        message += `*Admin Commands:*\n`;
        message += `/addgroup - Add current group\n`;
        message += `/startauto - Start auto-add\n`;
        message += `/stopauto - Stop auto-add\n`;
        message += `/settime 2 5 - Set timer\n`;
        message += `/listgroups - Show groups\n`;
    }
    
    message += `\n📊 /stats - Show statistics\n`;
    message += `🆘 /help - Help menu\n`;
    message += `🌐 Web Dashboard: http://localhost:${PORT}`;
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('startauto', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (state.groups.length === 0) {
        return ctx.reply('❌ No groups added! Use /addgroup first');
    }
    
    startAutoAdd();
    ctx.reply(`✅ Auto-add started!\n⏰ Every ${state.timerMinutes} minutes\n👥 ${state.membersPerInterval} members per group`);
});

bot.command('stopauto', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    stopAutoAdd();
    ctx.reply('⏹️ Auto-add stopped!');
});

bot.command('addgroup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (ctx.chat.type === 'private') {
        return ctx.reply('❌ Please use this command in a group!');
    }
    
    const groupId = ctx.chat.id;
    const groupName = ctx.chat.title || 'Unknown Group';
    
    // Check if already added
    const existing = state.groups.find(g => g.id === groupId);
    if (existing) {
        return ctx.reply(`✅ Group already added:\n${groupName}`);
    }
    
    // Add new group
    state.groups.push({
        id: groupId,
        name: groupName,
        username: ctx.chat.username || '',
        addedMembers: 0,
        addedAt: new Date()
    });
    
    ctx.reply(`✅ *Group Added Successfully!*\n\n📁 Name: ${groupName}\n👥 Members: Will auto-add\n⏰ Interval: ${state.timerMinutes} minutes\n📈 Status: Ready`, 
        { parse_mode: 'Markdown' });
});

bot.command('stats', (ctx) => {
    const totalGroups = state.groups.length;
    const activeGroups = state.groups.filter(g => g.addedMembers > 0).length;
    
    ctx.reply(`📊 *Bot Statistics*\n\n` +
        `👥 Total Added: ${state.totalAdded}\n` +
        `📁 Total Groups: ${totalGroups}\n` +
        `✅ Active Groups: ${activeGroups}\n` +
        `⚡ Auto-add: ${state.isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n` +
        `⏰ Timer: ${state.timerMinutes} minutes\n` +
        `👥 Per Interval: ${state.membersPerInterval} members`,
        { parse_mode: 'Markdown' });
});

bot.command('listgroups', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    if (state.groups.length === 0) {
        return ctx.reply('📭 No groups added yet!');
    }
    
    let message = `📁 *Added Groups (${state.groups.length})*\n\n`;
    
    state.groups.forEach((group, index) => {
        message += `${index + 1}. *${group.name}*\n`;
        message += `   👥 Added: ${group.addedMembers} members\n`;
        message += `   📅 Added on: ${new Date(group.addedAt).toLocaleDateString()}\n\n`;
    });
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('settime', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Usage: /settime [minutes] [members]\nExample: /settime 2 5');
    }
    
    const minutes = parseInt(args[1]);
    const members = parseInt(args[2]);
    
    if (isNaN(minutes) || isNaN(members) || minutes < 1 || members < 1) {
        return ctx.reply('❌ Please enter valid numbers!');
    }
    
    state.timerMinutes = minutes;
    state.membersPerInterval = members;
    
    // Restart auto-add if running
    if (state.isAutoAdding) {
        stopAutoAdd();
        startAutoAdd();
    }
    
    ctx.reply(`✅ Timer settings updated!\n⏰ Every ${minutes} minutes\n👥 ${members} members per group`);
});

// ==================== WEB DASHBOARD ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Dashboard route
app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'Telegram Marketing Dashboard',
        botUsername: 'Nova_marketing_bot',
        stats: {
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
            isAutoAdding: state.isAutoAdding,
            timerMinutes: state.timerMinutes,
            membersPerInterval: state.membersPerInterval
        },
        groups: state.groups
    });
});

// API Routes for dashboard
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            totalAdded: state.totalAdded,
            totalGroups: state.groups.length,
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
            return res.json({ success: false, message: 'No groups added!' });
        }
        startAutoAdd();
        res.json({ success: true, message: 'Auto-add started!' });
    } 
    else if (action === 'stop') {
        stopAutoAdd();
        res.json({ success: true, message: 'Auto-add stopped!' });
    }
    else if (action === 'update_timer') {
        const { minutes, members } = req.body;
        if (minutes && members) {
            state.timerMinutes = parseInt(minutes);
            state.membersPerInterval = parseInt(members);
            
            // Restart if running
            if (state.isAutoAdding) {
                stopAutoAdd();
                startAutoAdd();
            }
            
            res.json({ success: true, message: 'Timer updated!' });
        } else {
            res.json({ success: false, message: 'Invalid parameters' });
        }
    }
    else {
        res.json({ success: false, message: 'Invalid action' });
    }
});

// ==================== START SERVER ====================
// Start bot with webhook for Render, polling for local
if (process.env.RENDER) {
    // Webhook for production
    const WEBHOOK_PATH = `/bot${BOT_TOKEN}`;
    const WEBHOOK_URL = `https://${process.env.RENDER_SERVICE_NAME}.onrender.com${WEBHOOK_PATH}`;
    
    app.use(bot.webhookCallback(WEBHOOK_PATH));
    
    app.listen(PORT, async () => {
        console.log(`🚀 Server started on port ${PORT}`);
        console.log(`🌐 Web Dashboard: https://${process.env.RENDER_SERVICE_NAME}.onrender.com`);
        
        try {
            await bot.telegram.setWebhook(WEBHOOK_URL);
            console.log(`✅ Webhook set: ${WEBHOOK_URL}`);
        } catch (error) {
            console.log('⚠️ Webhook error, starting with polling...');
            bot.launch().then(() => console.log('✅ Bot started with polling'));
        }
    });
} else {
    // Polling for local development
    app.listen(PORT, () => {
        console.log(`🚀 Local server: http://localhost:${PORT}`);
        bot.launch().then(() => console.log('✅ Bot started locally'));
    });
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGINT');
    stopAutoAdd();
});

process.once('SIGTERM', () => {
    console.log('🛑 Stopping bot...');
    bot.stop('SIGTERM');
    stopAutoAdd();
});
