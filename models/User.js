const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    phone: String,
    isBot: Boolean,
    joinedAt: { type: Date, default: Date.now },
    addedBy: String,
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'banned'], 
        default: 'active' 
    },
    lastActive: { type: Date, default: Date.now },
    metadata: {
        source: String,
        campaign: String,
        tags: [String]
    }
});

module.exports = mongoose.model('User', userSchema);
