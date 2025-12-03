const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    groupId: { type: Number, required: true, unique: true },
    groupName: String,
    groupUsername: String,
    groupType: String,
    membersCount: Number,
    addedMembers: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    autoAdd: { type: Boolean, default: true },
    addInterval: { type: Number, default: 2, min: 1 }, // minutes
    membersPerInterval: { type: Number, default: 5, min: 1, max: 50 },
    lastAdded: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    settings: {
        avoidBots: { type: Boolean, default: true },
        checkActive: { type: Boolean, default: true },
        minAccountAge: { type: Number, default: 7 } // days
    }
});

module.exports = mongoose.model('Group', groupSchema);
