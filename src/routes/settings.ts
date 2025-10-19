import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import User from '../models/User';
import redis from '../config/redis';

const router = Router();

// Settings validation schema
const settingsSchema = z.object({
  messageDelay: z.number().min(1).max(60).optional(),
  maxRetries: z.number().min(1).max(10).optional(),
  autoRetry: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  spamDetection: z.boolean().optional(),
  messageRewriting: z.boolean().optional(),
  aiModel: z.enum(['gpt-3.5-turbo', 'gpt-4']).optional(),
  whatsappTimeout: z.number().min(30).max(300).optional(),
  qrRefreshInterval: z.number().min(1).max(30).optional(),
  autoReconnect: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  soundNotifications: z.boolean().optional(),
  notificationTypes: z.object({
    messageSent: z.boolean().optional(),
    messageFailed: z.boolean().optional(),
    bulkComplete: z.boolean().optional(),
    whatsappDisconnected: z.boolean().optional(),
  }).optional(),
  timezone: z.string().optional(),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  currency: z.string().optional(),
  batchSize: z.number().min(1).max(100).optional(),
  concurrentConnections: z.number().min(1).max(20).optional(),
  cacheEnabled: z.boolean().optional(),
  cacheDuration: z.number().min(5).max(1440).optional(),
  sessionTimeout: z.number().min(15).max(480).optional(),
  requirePasswordChange: z.boolean().optional(),
  twoFactorAuth: z.boolean().optional(),
  loginAttempts: z.number().min(3).max(10).optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  language: z.string().optional(),
  sidebarCollapsed: z.boolean().optional(),
  animationsEnabled: z.boolean().optional(),
  compactMode: z.boolean().optional(),
});

// Get user settings
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    
    // Get fresh user data from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get settings from user document or return defaults
    const settings = user.settings || {
      messageDelay: 2,
      maxRetries: 3,
      autoRetry: true,
      aiEnabled: true,
      spamDetection: true,
      messageRewriting: true,
      aiModel: 'gpt-3.5-turbo',
      whatsappTimeout: 60,
      qrRefreshInterval: 5,
      autoReconnect: true,
      emailNotifications: true,
      pushNotifications: true,
      soundNotifications: true,
      notificationTypes: {
        messageSent: true,
        messageFailed: true,
        bulkComplete: true,
        whatsappDisconnected: true,
      },
      timezone: 'Asia/Kolkata',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      currency: 'INR',
      batchSize: 10,
      concurrentConnections: 5,
      cacheEnabled: true,
      cacheDuration: 30,
      sessionTimeout: 120,
      requirePasswordChange: false,
      twoFactorAuth: false,
      loginAttempts: 5,
      theme: 'light',
      language: 'en',
      sidebarCollapsed: false,
      animationsEnabled: true,
      compactMode: false,
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user settings
router.put('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    const updates = req.body;

    // Validate the input using Zod
    const validatedData = settingsSchema.parse(updates);

    // Get the current user document from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user settings
    const currentSettings = user.settings || {};
    const newSettings = { ...currentSettings, ...validatedData };

    // Update user document
    user.settings = newSettings;
    await user.save();

    // Clear user cache to ensure fresh data
    const cacheKey = `user:${userId}`;
    await redis.del(cacheKey);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: newSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings data',
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reset settings to defaults
router.post('/reset', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!._id;
    
    const defaultSettings = {
      messageDelay: 2,
      maxRetries: 3,
      autoRetry: true,
      aiEnabled: true,
      spamDetection: true,
      messageRewriting: true,
      aiModel: 'gpt-3.5-turbo',
      whatsappTimeout: 60,
      qrRefreshInterval: 5,
      autoReconnect: true,
      emailNotifications: true,
      pushNotifications: true,
      soundNotifications: true,
      notificationTypes: {
        messageSent: true,
        messageFailed: true,
        bulkComplete: true,
        whatsappDisconnected: true,
      },
      timezone: 'Asia/Kolkata',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      currency: 'INR',
      batchSize: 10,
      concurrentConnections: 5,
      cacheEnabled: true,
      cacheDuration: 30,
      sessionTimeout: 120,
      requirePasswordChange: false,
      twoFactorAuth: false,
      loginAttempts: 5,
      theme: 'light',
      language: 'en',
      sidebarCollapsed: false,
      animationsEnabled: true,
      compactMode: false,
    };

    // Get the current user document from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.settings = defaultSettings;
    await user.save();

    // Clear user cache to ensure fresh data
    const cacheKey = `user:${userId}`;
    await redis.del(cacheKey);

    res.json({
      success: true,
      message: 'Settings reset to defaults',
      data: defaultSettings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
