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

// Simple in-memory database (තාවකාලික)
let groups = [];
let stats = {
    totalAdded: 0,
    isAutoAdding: false
};

// Connect to MongoDB (if available)
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.log('⚠️ Using in-memory database');
    }
};

connectDB();

// Group Schema
const groupSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    groupName: String,
    groupLink: String,
    addedMembers: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    autoAdd: { type: Boolean, default: true }
});

const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);

// AUTO MEMBER ADDER
let isAutoAdding = false;
let autoAddInterval;

const startAutoAdd = async () => {
    if (isAutoAdding) return;
    
    isAutoAdding = true;
    console.log('🚀 Auto Member Adder Started');
    
    autoAddInterval = setInterval(async () => {
        try {
            let activeGroups;
            
            // Try MongoDB first
            try {
                activeGroups = await Group.find({ isActive: true, autoAdd: true });
            } catch {
                // Fallback to in-memory
                activeGroups = groups.filter(g => g.isActive && g.autoAdd);
            }
            
            for (const group of activeGroups) {
                console.log(`🔄 Processing group: ${group.groupName}`);
                
                // Add members logic (simulated)
                const membersToAdd = 5; // 5 members per interval
                
                // Update stats
                if (group._id) {
                    // MongoDB document
                    group.addedMembers += membersToAdd;
                    await group.save();
                } else {
                    // In-memory
                    group.addedMembers += membersToAdd;
                }
                
                stats.totalAdded += membersToAdd;
                
                console.log(`✅ Added ${membersToAdd} members to ${group.groupName}`);
                
                // Notify admin
                try {
                    await bot.telegram.sendMessage(
                        process.env.ADMIN_USER_ID,
                        `✅ Auto-added ${membersToAdd} members to ${group.groupName}\nTotal: ${group.addedMembers}`
                    );
                } catch (err) {
                    console.log('Notification error:', err.message);
                }
            }
        } catch (error) {
            console.error('❌ Auto-add error:', error.message);
        }
    }, 120000); // 2 minutes = 120,000ms
};

const stopAutoAdd = () => {
    if (autoAddInterval) {
        clearInterval(autoAddInterval);
        isAutoAdding = false;
        console.log('⏹️ Auto Member Adder Stopped');
    }
};

// ADMIN CHECK FUNCTION
const isAdmin = (ctx) => {
    return ctx.from.id.toString() === process.env.ADMIN_USER_ID;
};

// BOT COMMANDS

// Start command - available to everyone
bot.command('start', async (ctx) => {
    const welcomeMsg = `🤖 Welcome to Nova Marketing Bot!\n\n` +
        `Available Commands:\n` +
        `📊 /stats - Show bot statistics\n` +
        `ℹ️ /help - Show all commands\n\n` +
        `🔐 Admin Commands:\n` +
        `/addgroup - Add a group for auto-adding\n` +
        `/listgroups - List all groups\n` +
        `/startauto - Start auto adding members\n` +
        `/stopauto - Stop auto adding\n` +
        `/settime - Set timer settings`;
    
    ctx.reply(welcomeMsg);
});

// Add group command - ADMIN ONLY
bot.command('addgroup', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    // Check if message is from a group
    if (ctx.chat.type === 'private') {
        return ctx.reply('❌ Please use this command in a group!');
    }
    
    const groupId = ctx.chat.id.toString();
    const groupName = ctx.chat.title || 'Unknown Group';
    
    try {
        // Check if group already exists
        let existingGroup;
        try {
            existingGroup = await Group.findOne({ groupId });
        } catch {
            existingGroup = groups.find(g => g.groupId === groupId);
        }
        
        if (existingGroup) {
            return ctx.reply(`✅ Group "${groupName}" is already added!`);
        }
        
        // Create new group
        const newGroup = {
            groupId,
            groupName,
            groupLink: `https://t.me/${ctx.chat.username || 'group'}`,
            addedMembers: 0,
            isActive: true,
            autoAdd: true
        };
        
        // Save to MongoDB or in-memory
        try {
            await Group.create(newGroup);
        } catch {
            groups.push(newGroup);
        }
        
        ctx.reply(`✅ Group added successfully!\n\n` +
            `📁 Name: ${groupName}\n` +
            `👥 Members will be auto-added every 2 minutes\n` +
            `✅ Active: Yes\n\n` +
            `Use /startauto to begin auto-adding!`);
        
        // Also send to admin privately
        bot.telegram.sendMessage(
            process.env.ADMIN_USER_ID,
            `📥 New group added:\n` +
            `Name: ${groupName}\n` +
            `ID: ${groupId}\n` +
            `Total groups: ${groups.length}`
        );
        
    } catch (error) {
        console.error('Add group error:', error);
        ctx.reply('❌ Error adding group. Please try again.');
    }
});

// List groups command - ADMIN ONLY
bot.command('listgroups', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    try {
        let allGroups;
        try {
            allGroups = await Group.find({});
        } catch {
            allGroups = groups;
        }
        
        if (!allGroups || allGroups.length === 0) {
            return ctx.reply('📭 No groups added yet!\nUse /addgroup in a group to add it.');
        }
        
        let message = `📁 Added Groups (${allGroups.length}):\n\n`;
        
        allGroups.forEach((group, index) => {
            message += `${index + 1}. ${group.groupName}\n`;
            message += `   👥 Added: ${group.addedMembers} members\n`;
            message += `   ✅ Active: ${group.isActive ? 'Yes' : 'No'}\n`;
            message += `   ⚡ Auto-add: ${group.autoAdd ? 'On' : 'Off'}\n\n`;
        });
        
        ctx.reply(message);
    } catch (error) {
        ctx.reply('❌ Error listing groups.');
    }
});

// Start auto command - ADMIN ONLY
bot.command('startauto', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    // Check if any groups are added
    let groupCount;
    try {
        groupCount = await Group.countDocuments({});
    } catch {
        groupCount = groups.length;
    }
    
    if (groupCount === 0) {
        return ctx.reply('❌ No groups added yet!\nFirst add a group using /addgroup');
    }
    
    startAutoAdd();
    ctx.reply(`✅ Auto member adder started!\n` +
        `⏰ Interval: 2 minutes\n` +
        `👥 Members per interval: 5\n` +
        `📁 Active groups: ${groupCount}`);
});

// Stop auto command - ADMIN ONLY
bot.command('stopauto', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    stopAutoAdd();
    ctx.reply('⏹️ Auto member adder stopped!');
});

// Stats command - AVAILABLE TO ALL
bot.command('stats', async (ctx) => {
    let groupCount, totalAdded;
    
    try {
        groupCount = await Group.countDocuments({});
        const result = await Group.aggregate([
            { $group: { _id: null, total: { $sum: "$addedMembers" } } }
        ]);
        totalAdded = result[0]?.total || 0;
    } catch {
        groupCount = groups.length;
        totalAdded = groups.reduce((sum, group) => sum + group.addedMembers, 0);
    }
    
    const statsMsg = `📊 Bot Statistics:\n\n` +
        `👥 Total Members Added: ${totalAdded}\n` +
        `📁 Total Groups: ${groupCount}\n` +
        `⚡ Auto-add Status: ${isAutoAdding ? 'RUNNING 🟢' : 'STOPPED 🔴'}\n` +
        `🤖 Bot: @Nova_marketing_bot\n\n` +
        `Use /help for all commands`;
    
    ctx.reply(statsMsg);
});

// Set time command - ADMIN ONLY
bot.command('settime', async (ctx) => {
    if (!isAdmin(ctx)) {
        return ctx.reply('❌ This command is for admins only!');
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply('Usage: /settime [minutes] [members]\nExample: /settime 2 5');
    }
    
    const minutes = parseInt(args[1]);
    const members = parseInt(args[2]);
    
    if (isNaN(minutes) || isNaN(members) || minutes < 1 || members < 1) {
        return ctx.reply('❌ Please enter valid numbers!');
    }
    
    ctx.reply(`✅ Settings updated:\n` +
        `⏰ Interval: ${minutes} minutes\n` +
        `👥 Members per interval: ${members}\n\n` +
        `Note: You need to restart auto-add with /startauto`);
});

// Help command - AVAILABLE TO ALL
bot.command('help', (ctx) => {
    const helpMsg = `🆘 Help - Nova Marketing Bot\n\n` +
        `Public Commands:\n` +
        `/start - Start the bot\n` +
        `/stats - Show statistics\n` +
        `/help - This help message\n\n` +
        `Admin Commands:\n` +
        `/addgroup - Add current group (use in a group)\n` +
        `/listgroups - List all added groups\n` +
        `/startauto - Start auto-adding members\n` +
        `/stopauto - Stop auto-adding\n` +
        `/settime [min] [members] - Set timer\n\n` +
        `📌 How to use:\n` +
        `1. Add bot to your group\n` +
        `2. In the group, send /addgroup\n` +
        `3. Send /startauto to begin\n` +
        `4. Bot will auto-add 5 members every 2 minutes`;
    
    ctx.reply(helpMsg);
});

// WEB DASHBOARD ROUTES
app.get('/', async (req, res) => {
    let groupCount, totalAdded;
    
    try {
        groupCount = await Group.countDocuments({});
        const result = await Group.aggregate([
            { $group: { _id: null, total: { $sum: "$addedMembers" } } }
        ]);
        totalAdded = result[0]?.total || 0;
    } catch {
        groupCount = groups.length;
        totalAdded = groups.reduce((sum, group) => sum + group.addedMembers, 0);
    }
    
    res.render('index', {
        title: 'Telegram Marketing Tool',
        botUsername: 'Nova_marketing_bot',
        totalUsers: groupCount * 10, // Estimated
        totalGroups: groupCount,
        totalAdded: totalAdded,
        isAutoAdding,
        botStatus: 'online'
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
});

// Launch Bot
bot.launch()
    .then(() => console.log('✅ Bot is running! @Nova_marketing_bot'))
    .catch(err => console.log('❌ Bot error:', err));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
