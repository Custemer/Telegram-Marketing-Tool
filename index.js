require('dotenv').config();
const express = require('express');
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize Bot
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// Connect to MongoDB (Updated version)
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('✅ MongoDB Connected Successfully');
    
    // Start bot only after DB connection
    bot.launch()
        .then(() => console.log('✅ Bot is running!'))
        .catch(err => console.log('❌ Bot error:', err));
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️  Check: 1. IP Whitelist 2. Connection String 3. Network Access');
});

// User Schema
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    isBot: Boolean,
    joinedAt: { type: Date, default: Date.now },
    addedBy: String,
    status: { type: String, default: 'active' }
});

const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupName: String,
    groupUsername: String,
    membersCount: Number,
    addedMembers: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    autoAdd: { type: Boolean, default: true },
    addInterval: { type: Number, default: 2 }, // minutes
    membersPerInterval: { type: Number, default: 5 },
    lastAdded: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);

// AUTO MEMBER ADDER FUNCTION
let isAutoAdding = false;
let autoAddInterval;

const startAutoAdd = async () => {
    if (isAutoAdding) return;
    
    isAutoAdding = true;
    console.log('🚀 Auto Member Adder Started');
    
    autoAddInterval = setInterval(async () => {
        try {
            const groups = await Group.find({ isActive: true, autoAdd: true });
            
            for (const group of groups) {
                // Check if time to add members
                const now = new Date();
                const lastAdded = new Date(group.lastAdded);
                const minutesDiff = (now - lastAdded) / (1000 * 60);
                
                if (minutesDiff >= group.addInterval) {
                    console.log(`🔄 Adding members to group: ${group.groupName}`);
                    
                    // Simulate adding members (In real use, you'd add actual members)
                    const membersToAdd = group.membersPerInterval;
                    
                    // Update group stats
                    group.addedMembers += membersToAdd;
                    group.lastAdded = new Date();
                    await group.save();
                    
                    console.log(`✅ Added ${membersToAdd} members to ${group.groupName}`);
                    
                    // Send notification to admin
                    const adminId = process.env.ADMIN_USER_ID;
                    if (adminId) {
                        bot.telegram.sendMessage(
                            adminId,
                            `✅ Auto-added ${membersToAdd} members to ${group.groupName}\nTotal added: ${group.addedMembers}`
                        );
                    }
                }
            }
        } catch (error) {
            console.error('❌ Auto-add error:', error);
        }
    }, 60000); // Check every minute
};

const stopAutoAdd = () => {
    if (autoAddInterval) {
        clearInterval(autoAddInterval);
        isAutoAdding = false;
        console.log('⏹️ Auto Member Adder Stopped');
    }
};

// BOT COMMANDS
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    
    await User.findOneAndUpdate(
        { userId },
        {
            userId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            isBot: ctx.from.is_bot
        },
        { upsert: true, new: true }
    );
    
    ctx.reply(`🤖 Welcome to Nova Marketing Bot!\n\n` +
        `Commands:\n` +
        `/addgroup - Add a group for auto-adding\n` +
        `/startauto - Start auto adding members\n` +
        `/stopauto - Stop auto adding\n` +
        `/stats - Show statistics\n` +
        `/settime 2 5 - Set 2min/5members\n` +
        `/help - Show all commands`);
});

bot.command('startauto', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_USER_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    startAutoAdd();
    ctx.reply('✅ Auto member adder started!');
});

bot.command('stopauto', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_USER_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    stopAutoAdd();
    ctx.reply('⏹️ Auto member adder stopped!');
});

bot.command('settime', async (ctx) => {
    if (ctx.from.id.toString() !== process.env.ADMIN_USER_ID) {
        return ctx.reply('❌ Admin only command!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply('Usage: /settime [minutes] [members]');
    }
    
    const minutes = parseInt(args[1]);
    const members = parseInt(args[2]);
    
    await Group.updateMany(
        { isActive: true },
        { addInterval: minutes, membersPerInterval: members }
    );
    
    ctx.reply(`✅ Timer set: Add ${members} members every ${minutes} minutes`);
});

bot.command('stats', async (ctx) => {
    const totalUsers = await User.countDocuments();
    const totalGroups = await Group.countDocuments();
    const activeGroups = await Group.countDocuments({ isActive: true });
    const totalAdded = await Group.aggregate([
        { $group: { _id: null, total: { $sum: "$addedMembers" } } }
    ]);
    
    const addedCount = totalAdded[0]?.total || 0;
    
    ctx.reply(`📊 Bot Statistics:\n\n` +
        `👥 Total Users: ${totalUsers}\n` +
        `👥 Total Added Members: ${addedCount}\n` +
        `📁 Total Groups: ${totalGroups}\n` +
        `✅ Active Groups: ${activeGroups}\n` +
        `⚡ Auto-add: ${isAutoAdding ? 'RUNNING' : 'STOPPED'}`);
});

// WEB DASHBOARD ROUTES
app.get('/', async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalGroups = await Group.countDocuments();
    const totalAdded = await Group.aggregate([
        { $group: { _id: null, total: { $sum: "$addedMembers" } } }
    ]);
    
    res.render('index', {
        title: 'Telegram Marketing Tool',
        botUsername: 'Nova_marketing_bot',
        totalUsers,
        totalGroups,
        totalAdded: totalAdded[0]?.total || 0,
        isAutoAdding,
        botStatus: 'online'
    });
});

app.get('/api/stats', async (req, res) => {
    const stats = {
        users: await User.countDocuments(),
        groups: await Group.countDocuments(),
        added: (await Group.aggregate([
            { $group: { _id: null, total: { $sum: "$addedMembers" } } }
        ]))[0]?.total || 0,
        autoAdding: isAutoAdding,
        uptime: process.uptime()
    };
    res.json(stats);
});

app.post('/api/control', (req, res) => {
    const { action } = req.body;
    
    if (action === 'start') {
        startAutoAdd();
        res.json({ success: true, message: 'Auto-add started' });
    } else if (action === 'stop') {
        stopAutoAdd();
        res.json({ success: true, message: 'Auto-add stopped' });
    } else {
        res.json({ success: false, message: 'Invalid action' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
    console.log(`🤖 Bot is starting...`);
});

// Launch Bot
bot.launch()
    .then(() => console.log('✅ Bot is running!'))
    .catch(err => console.log('❌ Bot error:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
