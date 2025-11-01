import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import Contact from '../models/Contact';
import Message from '../models/Message';
import BulkMessage from '../models/BulkMessage';
import aiService from '../services/aiService';
import whatsappService from '../services/whatsappService';
import Bull from 'bull';
const router = Router();

// Create Bull queue for message processing
const messageQueue = new Bull('message processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    timeout: 30000,
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
  },
});

// @route   POST /api/messages/analyze
// @desc    Analyze message for spam and get AI rewrite
// @access  Private
router.post('/analyze', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, category } = req.body;

    if (!message || !category) {
      return res.status(400).json({
        success: false,
        message: 'Message and category are required'
      });
    }

    // Analyze message for spam detection
    const analysis = await aiService.analyzeMessage(message, category);

    res.json({
      success: true,
      data: {
        originalMessage: message,
        isSpam: analysis.isSpam,
        spamWords: analysis.spamWords,
        rewrittenMessage: analysis.rewrittenMessage,
        confidence: analysis.confidence,
        complianceScore: analysis.complianceScore
      }
    });

  } catch (error) {
    console.error('Message analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during message analysis'
    });
  }
});

// @route   POST /api/messages/send-bulk
// @desc    Send bulk messages with AI processing
// @access  Private
router.post('/send-bulk', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { message, category, selectedContacts } = req.body;

    // Debug logging
    console.log('📤 Bulk message request:', { 
      message: message?.substring(0, 50) + '...', 
      category, 
      selectedContactsCount: selectedContacts?.length 
    });

    // Validate required fields
    if (!message || !category || !selectedContacts || selectedContacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: message, category, and selectedContacts are required'
      });
    }

    // Check if WhatsApp is connected
    const userId = user._id.toString();
    if (!whatsappService.isConnected(userId)) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp is not connected. Please connect first.'
      });
    }

    // Verify all contacts exist and belong to user
    const contacts = await Contact.find({
      _id: { $in: selectedContacts },
      userId: user._id,
      isActive: true
    });

    if (contacts.length !== selectedContacts.length) {
      return res.status(400).json({
        success: false,
        message: 'Some selected contacts are invalid or not found'
      });
    }

    // Get user settings for AI processing
    const userSettings = user.settings || {};
    
    // Analyze and rewrite message
    const analysis = await aiService.analyzeMessage(message, category);

    // Create bulk message record
    const bulkMessage = new BulkMessage({
      userId: user._id,
      originalMessage: message,
      aiRewrittenMessage: analysis.rewrittenMessage,
      category,
      selectedContacts,
      totalContacts: contacts.length,
      spamWords: analysis.spamWords,
      progress: {
        total: contacts.length,
        sent: 0,
        failed: 0,
        pending: contacts.length
      }
    });

    await bulkMessage.save();

    // Generate completely unique messages for each contact with category-based personalization
    console.log(`🎯 Generating ${contacts.length} unique messages with category: ${category}`);
    const messages = [];
    
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      // Generate truly personalized message for each contact based on their category
      const contactCategory = contact.category || 'general';
      const variationIndex = (i % 20) + 1; // Increased variation range
      
      const personalizedMessage = await aiService.generatePersonalizedMessage(
        analysis.rewrittenMessage,
        contact.name,
        variationIndex,
        category // Pass message category to AI service
      );

      const messageRecord = new Message({
        userId: user._id,
        contactId: contact._id,
        originalMessage: message,
        aiRewrittenMessage: personalizedMessage,
        category,
        spamWords: analysis.spamWords,
        status: 'pending'
      });

      messages.push(messageRecord);
      
      // Log progress for large batches
      if ((i + 1) % 50 === 0) {
        console.log(`✅ Generated ${i + 1}/${contacts.length} personalized messages`);
      }
    }

    await Message.insertMany(messages);
    console.log(`📝 Created ${messages.length} message records in database`);

    // Get user settings for message delay and retry attempts
    const messageSettings = user.settings || {};
    const messageDelaySeconds = messageSettings.messageDelay || 60; // User's delay in seconds
    const maxRetries = messageSettings.maxRetries || 3;
    
    console.log(`📅 Scheduling ${messages.length} messages with ${messageDelaySeconds}s delay between each`);
    
    // Add jobs to queue with calculated delays
    for (let i = 0; i < messages.length; i++) {
      const messageRecord = messages[i];
      const delay = i * messageDelaySeconds * 1000; // Convert to milliseconds
      
      console.log(`📤 Message ${i + 1}/${messages.length}: ${messageRecord.contactId} - Delay: ${delay}ms (${Math.round(delay / 1000)}s)`);
      
      await messageQueue.add('send-message', {
        messageId: messageRecord._id.toString(),
        bulkMessageId: bulkMessage._id.toString(),
        userId: userId,
        contactPhone: contacts.find(c => c._id.toString() === messageRecord.contactId.toString())?.phone,
        message: messageRecord.aiRewrittenMessage,
        contactIndex: i,
        totalContacts: messages.length
      }, {
        delay: delay, // Calculated delay for each message
        attempts: maxRetries, // Use user-configured retry attempts
        backoff: {
          type: 'exponential',
          delay: 2000,
        }
      });
    }

    // Update bulk message status
    bulkMessage.status = 'processing';
    bulkMessage.startedAt = new Date();
    await bulkMessage.save();

    res.json({
      success: true,
      message: 'Bulk message processing started',
      data: {
        bulkMessageId: bulkMessage._id,
        totalContacts: contacts.length,
        status: 'processing',
        analysis: {
          isSpam: analysis.isSpam,
          spamWords: analysis.spamWords,
          complianceScore: analysis.complianceScore
        }
      }
    });

  } catch (error) {
    console.error('Bulk message error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during bulk messaging'
    });
  }
});

// @route   GET /api/messages/bulk
// @desc    Get all bulk messages for user
// @access  Private
router.get('/bulk', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { page = 1, limit = 10, status } = req.query;

    const query: any = { userId };
    if (status) {
      query.status = status;
    }

    const bulkMessages = await BulkMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await BulkMessage.countDocuments(query);

    res.json({
      success: true,
      data: {
        bulkMessages,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get bulk messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/messages/bulk/:id/status
// @desc    Get bulk message status and progress
// @access  Private
router.get('/bulk/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const bulkMessage = await BulkMessage.findOne({
      _id: id,
      userId: user._id
    });

    if (!bulkMessage) {
      return res.status(404).json({
        success: false,
        message: 'Bulk message not found'
      });
    }

    res.json({
      success: true,
      data: {
        bulkMessage: {
          id: bulkMessage._id,
          status: bulkMessage.status,
          progress: bulkMessage.progress,
          progressPercentage: (bulkMessage as any).progressPercentage,
          originalMessage: bulkMessage.originalMessage,
          aiRewrittenMessage: bulkMessage.aiRewrittenMessage,
          category: bulkMessage.category,
          totalContacts: bulkMessage.totalContacts,
          startedAt: bulkMessage.startedAt,
          completedAt: bulkMessage.completedAt,
          spamWords: bulkMessage.spamWords
        }
      }
    });

  } catch (error) {
    console.error('Bulk message status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/messages/bulk/:id/details
// @desc    Get detailed progress for each contact in bulk message
// @access  Private
router.get('/bulk/:id/details', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const bulkMessage = await BulkMessage.findOne({
      _id: id,
      userId: user._id
    });

    if (!bulkMessage) {
      return res.status(404).json({
        success: false,
        message: 'Bulk message not found'
      });
    }

    const messages = await Message.find({
      userId: user._id,
      originalMessage: bulkMessage.originalMessage,
      createdAt: { $gte: bulkMessage.createdAt }
    })
    .populate('contactId', 'name phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

    const total = await Message.countDocuments({
      userId: user._id,
      originalMessage: bulkMessage.originalMessage,
      createdAt: { $gte: bulkMessage.createdAt }
    });

    res.json({
      success: true,
      data: {
        messages: messages.map(msg => ({
          id: msg._id,
          contact: msg.contactId,
          status: msg.status,
          sentAt: msg.sentAt,
          deliveredAt: msg.deliveredAt,
          readAt: msg.readAt,
          errorMessage: msg.errorMessage,
          retryCount: msg.retryCount
        })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalMessages: total,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Bulk message details error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/messages/history
// @desc    Get message history for the user
// @access  Private
router.get('/history', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { page = 1, limit = 50, status = '' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    let query: any = { userId: user._id };
    if (status) {
      query.status = status;
    }

    const messages = await Message.find(query)
      .populate('contactId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Message.countDocuments(query);

    res.json({
      success: true,
      data: {
        messages: messages.map(msg => ({
          id: msg._id,
          contact: msg.contactId,
          originalMessage: msg.originalMessage,
          aiRewrittenMessage: msg.aiRewrittenMessage,
          category: msg.category,
          status: msg.status,
          sentAt: msg.sentAt,
          deliveredAt: msg.deliveredAt,
          readAt: msg.readAt,
          errorMessage: msg.errorMessage,
          retryCount: msg.retryCount,
          createdAt: msg.createdAt
        })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalMessages: total,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Message history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/messages/statistics
// @desc    Get messaging statistics for the user
// @access  Private
router.get('/statistics', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { period = '30' } = req.query; // days

    console.log('Statistics request for user:', user._id, 'period:', period);

    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log('Date range:', startDate, 'to', new Date());

    const stats = await Message.aggregate([
      {
        $match: {
          userId: user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('Message stats:', stats);

    const bulkStats = await BulkMessage.aggregate([
      {
        $match: {
          userId: user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('Bulk message stats:', bulkStats);

    const totalContacts = await Contact.countDocuments({ userId: user._id, isActive: true });
    console.log('Total contacts:', totalContacts);

    // If no data exists, create some sample data for testing
    if (totalContacts === 0 && stats.length === 0) {
      console.log('No data found, creating sample data for testing...');
      
      // Create sample contacts
      const sampleContacts = [
        { userId: user._id, name: 'John Doe', phone: '+1234567890', email: 'john@example.com', isActive: true },
        { userId: user._id, name: 'Jane Smith', phone: '+1234567891', email: 'jane@example.com', isActive: true },
        { userId: user._id, name: 'Bob Johnson', phone: '+1234567892', email: 'bob@example.com', isActive: true },
        { userId: user._id, name: 'Alice Brown', phone: '+1234567893', email: 'alice@example.com', isActive: true },
        { userId: user._id, name: 'Charlie Wilson', phone: '+1234567894', email: 'charlie@example.com', isActive: true },
        { userId: user._id, name: 'Diana Davis', phone: '+1234567895', email: 'diana@example.com', isActive: true },
        { userId: user._id, name: 'Eve Miller', phone: '+1234567896', email: 'eve@example.com', isActive: true }
      ];
      
      await Contact.insertMany(sampleContacts);
      console.log('Sample contacts created');
    }

    const responseData = {
      period: `${days} days`,
      messageStats: stats,
      bulkMessageStats: bulkStats,
      totalContacts: await Contact.countDocuments({ userId: user._id, isActive: true })
    };

    console.log('Sending statistics response:', responseData);

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Process message queue with production-level concurrency
messageQueue.process('send-message', 5, async (job) => {
  const { messageId, bulkMessageId, userId, contactPhone, message, contactIndex, totalContacts } = job.data;

  try {
    console.log(`📤 [${contactIndex + 1}/${totalContacts}] Processing message for ${contactPhone}`);
    
    // Update message status to processing
    await Message.findByIdAndUpdate(messageId, { status: 'processing' });

    // Send WhatsApp message with timeout protection
    const sendPromise = whatsappService.sendMessage(userId, contactPhone, message);
    const timeoutPromise = new Promise<{ success: boolean; error: string }>((_, reject) => 
      setTimeout(() => reject(new Error('Message send timeout')), 30000)
    );
    
    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result.success && 'messageId' in result) {
      console.log(`✅ [${contactIndex + 1}/${totalContacts}] Message sent to ${contactPhone}`);
      
      // Update message as sent
      await Message.findByIdAndUpdate(messageId, {
        status: 'sent',
        whatsappMessageId: result.messageId || 'unknown',
        sentAt: new Date()
      });

      // Update bulk message progress atomically
      const bulkMsg = await BulkMessage.findByIdAndUpdate(
        bulkMessageId, 
        { $inc: { 'progress.sent': 1, 'progress.pending': -1 } },
        { new: true }
      );

      // Check if campaign is complete
      if (bulkMsg && bulkMsg.progress.pending === 0) {
        await BulkMessage.findByIdAndUpdate(bulkMessageId, {
          status: 'completed',
          completedAt: new Date()
        });
        console.log(`🎉 Campaign ${bulkMessageId} completed! Sent: ${bulkMsg.progress.sent}, Failed: ${bulkMsg.progress.failed}`);
      }

    } else {
      const errorMessage = 'error' in result ? result.error : 'Unknown error';
      console.log(`❌ [${contactIndex + 1}/${totalContacts}] Failed: ${errorMessage}`);
      
      // Update message as failed
      await Message.findByIdAndUpdate(messageId, {
        status: 'failed',
        errorMessage,
        $inc: { retryCount: 1 }
      });

      // Update bulk message progress
      const bulkMsg = await BulkMessage.findByIdAndUpdate(
        bulkMessageId,
        { $inc: { 'progress.failed': 1, 'progress.pending': -1 } },
        { new: true }
      );

      // Check if campaign is complete (even with failures)
      if (bulkMsg && bulkMsg.progress.pending === 0) {
        await BulkMessage.findByIdAndUpdate(bulkMessageId, {
          status: 'completed',
          completedAt: new Date()
        });
        console.log(`🎉 Campaign ${bulkMessageId} completed with some failures. Sent: ${bulkMsg.progress.sent}, Failed: ${bulkMsg.progress.failed}`);
      }
      
      // Throw error to trigger Bull retry mechanism
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error(`❌ Message processing error for ${contactPhone}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await Message.findByIdAndUpdate(messageId, {
      status: 'failed',
      errorMessage,
      $inc: { retryCount: 1 }
    });

    const bulkMsg = await BulkMessage.findByIdAndUpdate(
      bulkMessageId,
      { $inc: { 'progress.failed': 1, 'progress.pending': -1 } },
      { new: true }
    );

    // Check if campaign is complete (even with failures in catch block)
    if (bulkMsg && bulkMsg.progress.pending === 0) {
      await BulkMessage.findByIdAndUpdate(bulkMessageId, {
        status: 'completed',
        completedAt: new Date()
      });
      console.log(`🎉 Campaign ${bulkMessageId} completed (with errors). Sent: ${bulkMsg.progress.sent}, Failed: ${bulkMsg.progress.failed}`);
    }
    
    // Re-throw to let Bull handle retry logic
    throw error;
  }
});

// Queue event handlers for monitoring
messageQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

messageQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err.message);
});

messageQueue.on('stalled', (job) => {
  console.warn(`⚠️ Job ${job.id} has stalled and will be reprocessed`);
});

messageQueue.on('active', (job) => {
  console.log(`🔄 Job ${job.id} is now active`);
});

export default router;
