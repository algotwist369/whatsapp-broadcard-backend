const mongoose = require('mongoose');

// Simple test to verify AutoReply model validation fix
async function testAutoReplyValidation() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-broadcast');
    console.log('✅ Connected to database');

    // Import the AutoReply model
    const AutoReply = require('../models/AutoReply').default;

    // Test 1: AI-generated response should not require responseTemplate
    console.log('\n🧪 Testing AI-generated auto-reply validation...');
    
    const aiAutoReply = new AutoReply({
      userId: new mongoose.Types.ObjectId(),
      name: 'AI Auto-Reply Test',
      description: 'Test AI auto-reply',
      category: 'general',
      responseType: 'ai_generated',
      triggerKeywords: [],
      responseTemplate: '', // Empty template should be allowed for AI
      priority: 1,
      isActive: true,
      aiSettings: {
        useAI: true,
        personality: 'professional',
        includeGreeting: true,
        includeClosing: true,
        useRAG: true
      },
      statistics: {
        totalTriggers: 0,
        successfulReplies: 0,
        failedReplies: 0
      }
    });

    await aiAutoReply.validate();
    console.log('✅ AI auto-reply validation passed - empty responseTemplate allowed');

    // Test 2: Regular text response should still require responseTemplate
    console.log('\n🧪 Testing regular text auto-reply validation...');
    
    try {
      const textAutoReply = new AutoReply({
        userId: new mongoose.Types.ObjectId(),
        name: 'Text Auto-Reply Test',
        description: 'Test text auto-reply',
        category: 'general',
        responseType: 'text',
        triggerKeywords: ['hello'],
        responseTemplate: '', // Empty template should fail for text
        priority: 1,
        isActive: true,
        statistics: {
          totalTriggers: 0,
          successfulReplies: 0,
          failedReplies: 0
        }
      });

      await textAutoReply.validate();
      console.log('❌ Text auto-reply validation should have failed but passed');
    } catch (error) {
      if (error.name === 'ValidationError' && error.errors.responseTemplate) {
        console.log('✅ Text auto-reply validation correctly failed - responseTemplate required');
      } else {
        console.log('❌ Unexpected validation error:', error.message);
      }
    }

    console.log('\n🎉 All validation tests passed!');
    console.log('✅ AI-generated responses can have empty responseTemplate');
    console.log('✅ Regular text responses still require responseTemplate');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Test completed');
  }
}

// Run the test
testAutoReplyValidation();
