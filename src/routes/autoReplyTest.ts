import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import AutoReply from '../models/AutoReply';
import whatsappService from '../services/whatsappService';
import autoReplyService from '../services/autoReplyService';

const router = Router();

// @route   POST /api/auto-reply-test/create-default
// @desc    Create a default auto-reply rule for testing
// @access  Private
router.post('/create-default', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id;

    // Check if a default auto-reply already exists
    const existing = await AutoReply.findOne({
      userId,
      name: 'Default Auto Reply'
    });

    if (existing) {
      return res.json({
        success: true,
        message: 'Default auto-reply already exists',
        data: {
          id: existing._id,
          name: existing.name,
          isActive: existing.isActive,
          triggerKeywords: existing.triggerKeywords
        }
      });
    }

    // Create a comprehensive default auto-reply
    const defaultAutoReply = new AutoReply({
      userId,
      name: 'Default Auto Reply',
      description: 'Automatic welcome and help messages',
      isActive: true,
      triggerKeywords: [
        'hello', 'hi', 'hey', 'hii', 'hiii',
        'good morning', 'good evening', 'good afternoon',
        'test', 'testing',
        'help', 'support', 'assist',
        'info', 'information',
        'price', 'cost', 'how much', 'rates',
        'booking', 'book', 'appointment', 'schedule'
      ],
      triggerPatterns: [],
      responseTemplate: 'Hello! Thank you for contacting us. How can I help you today?',
      responseType: 'text',
      category: 'general',
      priority: 5,
      conditions: {},
      statistics: {
        totalTriggers: 0,
        successfulReplies: 0,
        failedReplies: 0
      }
    });

    await defaultAutoReply.save();

    console.log(`✅ Created default auto-reply for user: ${userId}`);

    res.json({
      success: true,
      message: 'Default auto-reply created successfully',
      data: {
        id: defaultAutoReply._id,
        name: defaultAutoReply.name,
        isActive: defaultAutoReply.isActive,
        triggerKeywords: defaultAutoReply.triggerKeywords,
        responseTemplate: defaultAutoReply.responseTemplate
      }
    });

  } catch (error) {
    console.error('Error creating default auto-reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create default auto-reply',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// @route   GET /api/auto-reply-test/check-setup
// @desc    Check if auto-reply system is properly set up
// @access  Private
router.get('/check-setup', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    // Check WhatsApp connection
    const whatsappStatus = whatsappService.getConnectionStatus(userId);
    const whatsappInfo = whatsappService.getConnectionInfo(userId);

    // Check auto-reply rules
    const autoReplyCount = await AutoReply.countDocuments({
      userId: user._id,
      isActive: true
    });

    const autoReplies = await AutoReply.find({
      userId: user._id,
      isActive: true
    }).select('name triggerKeywords responseType isActive');

    // Detailed diagnostics
    const diagnostics = {
      whatsapp: {
        isConnected: whatsappStatus.isConnected,
        state: whatsappStatus.state,
        hasClient: whatsappInfo.exists,
        hasSession: whatsappInfo.hasSession,
        messageListenerSetup: whatsappInfo.exists && whatsappStatus.isConnected
      },
      autoReply: {
        totalRules: autoReplyCount,
        hasActiveRules: autoReplyCount > 0,
        rules: autoReplies.map(ar => ({
          name: ar.name,
          type: ar.responseType,
          keywords: ar.triggerKeywords,
          active: ar.isActive
        }))
      },
      systemReady: whatsappStatus.isConnected && autoReplyCount > 0,
      issues: []
    };

    // Identify issues
    if (!whatsappStatus.isConnected) {
      diagnostics.issues.push('WhatsApp is not connected');
    }
    if (autoReplyCount === 0) {
      diagnostics.issues.push('No active auto-reply rules found');
    }
    if (!whatsappInfo.exists) {
      diagnostics.issues.push('No WhatsApp client instance found');
    }

    res.json({
      success: true,
      data: diagnostics,
      recommendations: diagnostics.issues.length > 0 ? [
        ...(!whatsappStatus.isConnected ? ['Connect WhatsApp via frontend'] : []),
        ...(autoReplyCount === 0 ? ['Create at least one auto-reply rule using POST /api/auto-reply-test/create-default'] : [])
      ] : ['System is ready! Send a test message to verify.']
    });

  } catch (error) {
    console.error('Error checking auto-reply setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check setup',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// @route   POST /api/auto-reply-test/simulate
// @desc    Simulate receiving a message to test auto-reply
// @access  Private
router.post('/simulate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    console.log(`🧪 Simulating auto-reply for user ${userId}, phone: ${phoneNumber}, message: "${message}"`);

    // Manually trigger auto-reply processing
    const result = await whatsappService.triggerAutoReply(userId, phoneNumber, message);

    res.json({
      success: true,
      message: 'Auto-reply simulation completed',
      data: {
        shouldReply: result.shouldReply,
        response: result.response,
        autoReplyId: result.autoReplyId,
        confidence: result.confidence,
        error: result.error
      }
    });

  } catch (error) {
    console.error('Error simulating auto-reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to simulate auto-reply',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

