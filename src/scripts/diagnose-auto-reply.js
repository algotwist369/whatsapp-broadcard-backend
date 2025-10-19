const mongoose = require('mongoose');
const AutoReply = require('../models/AutoReply');
const AutoReplyLog = require('../models/AutoReplyLog');
const ReplyData = require('../models/ReplyData');
const User = require('../models/User');
const Contact = require('../models/Contact');
const autoReplyService = require('../services/autoReplyService');
const whatsappService = require('../services/whatsappService');

async function diagnoseAutoReply() {
  try {
    console.log('🔍 Auto-Reply System Diagnostic');
    console.log('================================');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-broadcast');
    console.log('✅ Connected to database');

    // Check users with WhatsApp connections
    const connectedUsers = await User.find({ 
      whatsappConnected: true,
      isActive: true 
    }).select('_id name email whatsappConnected');

    console.log(`\n📱 Users with WhatsApp connections: ${connectedUsers.length}`);
    connectedUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ID: ${user._id}`);
    });

    if (connectedUsers.length === 0) {
      console.log('❌ No users with WhatsApp connections found');
      return;
    }

    // Check auto-replies for each user
    for (const user of connectedUsers) {
      console.log(`\n👤 Checking auto-replies for user: ${user.name}`);
      
      const autoReplies = await AutoReply.find({ 
        userId: user._id,
        isActive: true 
      });

      console.log(`  📋 Active auto-replies: ${autoReplies.length}`);
      
      if (autoReplies.length === 0) {
        console.log('  ⚠️ No active auto-replies found for this user');
        continue;
      }

      autoReplies.forEach(ar => {
        console.log(`    - ${ar.name} (${ar.category}) - Keywords: ${ar.triggerKeywords?.join(', ') || 'None'}`);
      });

      // Check reply data
      const replyData = await ReplyData.find({ 
        userId: user._id,
        isActive: true 
      });

      console.log(`  📊 Reply data sets: ${replyData.length}`);
      replyData.forEach(rd => {
        console.log(`    - ${rd.name} (${rd.category}) - Items: ${rd.data?.length || 0}`);
      });

      // Check WhatsApp connection status
      const isConnected = whatsappService.isConnected(user._id.toString());
      console.log(`  🔌 WhatsApp connected: ${isConnected ? '✅ Yes' : '❌ No'}`);

      if (!isConnected) {
        console.log('  ⚠️ WhatsApp not connected - auto-reply will not work');
        continue;
      }

      // Test auto-reply with sample message
      console.log('  🧪 Testing auto-reply with sample message...');
      
      try {
        const testResult = await autoReplyService.processIncomingMessage(
          user._id.toString(),
          '1234567890', // Test phone number
          'Hello, I need help with your services'
        );

        console.log(`    Result: ${testResult.shouldReply ? '✅ Would reply' : '❌ No reply triggered'}`);
        if (testResult.shouldReply && testResult.response) {
          console.log(`    Response: "${testResult.response.substring(0, 100)}..."`);
        }
        if (testResult.error) {
          console.log(`    Error: ${testResult.error}`);
        }
      } catch (error) {
        console.log(`    ❌ Test failed: ${error.message}`);
      }
    }

    // Check recent auto-reply logs
    console.log('\n📝 Recent auto-reply logs:');
    const recentLogs = await AutoReplyLog.find()
      .populate('userId', 'name email')
      .populate('autoReplyId', 'name category')
      .sort({ createdAt: -1 })
      .limit(10);

    if (recentLogs.length === 0) {
      console.log('  No recent auto-reply logs found');
    } else {
      recentLogs.forEach(log => {
        console.log(`  - ${log.createdAt.toISOString()}: ${log.userId?.name} - ${log.autoReplyId?.name} - ${log.status}`);
      });
    }

    // Check WhatsApp service status
    console.log('\n🔧 WhatsApp Service Status:');
    console.log(`  Initialized: ${whatsappService.isInitialized || false}`);
    console.log(`  Active connections: ${whatsappService.getConnectionCount() || 0}`);

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Diagnostic completed');
  }
}

// Run diagnostic
diagnoseAutoReply();
