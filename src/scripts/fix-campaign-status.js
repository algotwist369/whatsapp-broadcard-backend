/**
 * Fix Campaign Status Script
 * Updates all "processing" campaigns to "completed" if pending = 0
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../environment-config.env') });

const BulkMessageSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  originalMessage: String,
  aiRewrittenMessage: String,
  category: String,
  selectedContacts: [mongoose.Schema.Types.ObjectId],
  totalContacts: Number,
  status: String,
  progress: {
    total: Number,
    sent: Number,
    failed: Number,
    pending: Number
  },
  spamWords: [String],
  replacements: Array,
  startedAt: Date,
  completedAt: Date,
  errorMessage: String
}, { timestamps: true });

const BulkMessage = mongoose.model('BulkMessage', BulkMessageSchema);

async function fixCampaignStatus() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bulk-messaging');
    console.log('✅ Connected to MongoDB\n');

    // Find all campaigns with pending = 0 but status still "processing"
    const stuckCampaigns = await BulkMessage.find({
      status: 'processing',
      'progress.pending': 0
    });

    console.log(`📊 Found ${stuckCampaigns.length} campaigns stuck in "processing" status\n`);

    if (stuckCampaigns.length === 0) {
      console.log('✅ No campaigns need fixing!');
      process.exit(0);
    }

    let fixed = 0;
    for (const campaign of stuckCampaigns) {
      console.log(`🔄 Fixing campaign ${campaign._id}:`);
      console.log(`   Message: "${campaign.originalMessage?.substring(0, 50)}..."`);
      console.log(`   Progress: Sent ${campaign.progress.sent}, Failed ${campaign.progress.failed}, Pending ${campaign.progress.pending}`);
      
      await BulkMessage.findByIdAndUpdate(campaign._id, {
        status: 'completed',
        completedAt: campaign.completedAt || new Date()
      });
      
      console.log(`   ✅ Status updated to "completed"\n`);
      fixed++;
    }

    console.log(`\n🎉 Successfully fixed ${fixed} campaigns!`);
    console.log('✅ All campaigns now have correct status\n');

  } catch (error) {
    console.error('❌ Error fixing campaign status:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 MongoDB connection closed');
    process.exit(0);
  }
}

// Run the fix
fixCampaignStatus();

