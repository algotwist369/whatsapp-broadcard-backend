import express from 'express';
import { authenticate } from '../middleware/auth';
import SpaData from '../models/SpaData';
import ConversationState from '../models/ConversationState';
import ConversationHistory from '../models/ConversationHistory';
import AutoReplyRule from '../models/AutoReplyRule';

const router = express.Router();

const formatPhone = (phone: string): string => {
  let num = phone.replace(/\D/g, '');
  if (num.startsWith('91')) return `+${num}`;
  if (num.startsWith('0')) return `+91${num.slice(1)}`;
  if (num.length === 10) return `+91${num}`;
  return `+91${num}`;
};

router.get('/spa-data', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    let spaData = await SpaData.findOne({ userId });

    if (!spaData) {
      spaData = new SpaData({
        userId,
        spaName: 'Aquam Spa',
        location: 'Trivandrum, Kerala',
        address: 'Your Spa Address',
        phone: '+91 1234567890',
        email: 'info@aquamspa.com',
        adminPhone: '7388480128',
        mapUrl: 'https://maps.app.goo.gl/1234567890',
        discounts: 'First visit 20% off, next 10% off',
        services: [
          {
            name: 'Swedish Massage',
            description: 'Relaxing full-body massage with gentle strokes',
            variants: [
              { duration: 60, price: 1999 },
              { duration: 90, price: 2799 },
              { duration: 120, price: 3499 }
            ],
            benefits: ['Reduces stress', 'Improves circulation', 'Relieves muscle tension']
          },
          {
            name: 'Deep Tissue Massage',
            description: 'Therapeutic massage targeting deep muscle layers',
            variants: [
              { duration: 60, price: 2799 },
              { duration: 90, price: 3799 }
            ],
            benefits: ['Reduces muscle stiffness', 'Relieves chronic pain']
          },
          {
            name: 'Balinese Massage',
            description: 'Traditional Indonesian massage with aromatic oils',
            variants: [
              { duration: 90, price: 3299 }
            ],
            benefits: ['Deep relaxation', 'Improved sleep']
          },
          {
            name: 'Head Massage',
            description: 'Relieves tension in head, neck & shoulders',
            variants: [
              { duration: 30, price: 999 },
              { duration: 45, price: 1499 }
            ],
            benefits: ['Reduces headache', 'Improves focus']
          }
        ],
        workingHours: [
          { day: 'Monday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Tuesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Wednesday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Thursday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Friday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Saturday', openTime: '09:00', closeTime: '21:00', isOpen: true },
          { day: 'Sunday', openTime: '10:00', closeTime: '20:00', isOpen: true }
        ],
        autoReplySettings: {
          isEnabled: false,
          welcomeMessage: 'Hello! Thank you for reaching out to {spaName}. How can I help you today?',
          fallbackMessage: 'I\'m sorry, I didn\'t understand that. Could you please rephrase your question?',
          bookingConfirmationMessage: 'Thank you! Your booking has been successfully confirmed.',
          adminNotificationMessage: 'New booking received: {customerName} - {service} - {date} at {time}'
        }
      });

      await spaData.save();
    } else {
      let migrated = false;
      for (const service of spaData.services) {
        const legacy = service as any;
        if (legacy.duration && legacy.price && !service.variants) {
          service.variants = [{ duration: legacy.duration, price: legacy.price }];
          delete legacy.duration;
          delete legacy.price;
          migrated = true;
        }
      }
      if (migrated) {
        spaData.markModified('services');
        await spaData.save();
      }
    }

    res.json({
      success: true,
      data: spaData
    });
  } catch (error: any) {
    console.error('Error getting spa data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching spa data',
      error: error.message
    });
  }
});

router.put('/spa-data', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const updateData = req.body;

    if (updateData.services) {
      for (const service of updateData.services) {
        if (!service.variants || !Array.isArray(service.variants) || service.variants.length === 0) {
          return res.status(400).json({
            success: false,
            message: `Service "${service.name}" must have at least one duration & price.`
          });
        }
        for (const v of service.variants) {
          if (!v.duration || !v.price || v.duration < 15 || v.price < 0) {
            return res.status(400).json({
              success: false,
              message: `Invalid variant for "${service.name}". Duration ≥ 15 min, Price ≥ 0.`
            });
          }
        }
      }
    }

    const spaData = await SpaData.findOneAndUpdate(
      { userId },
      updateData,
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      data: spaData,
      message: 'Spa data updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating spa data:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating spa data',
      error: error.message
    });
  }
});

router.post('/toggle', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const { isEnabled } = req.body;

    const spaData = await SpaData.findOneAndUpdate(
      { userId },
      { 'autoReplySettings.isEnabled': isEnabled },
      { new: true }
    );

    if (!spaData) {
      return res.status(404).json({
        success: false,
        message: 'Spa data not found'
      });
    }

    res.json({
      success: true,
      data: { isEnabled: spaData.autoReplySettings.isEnabled },
      message: `Auto-reply ${isEnabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error: any) {
    console.error('Error toggling auto-reply:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling auto-reply',
      error: error.message
    });
  }
});

router.get('/conversations', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;

    const conversations = await ConversationState.find({ userId, isActive: true })
      .select({
        customerPhone: 1,
        currentStep: 1,
        'context.customerName': 1,
        'context.selectedService': 1,
        'context.preferredDate': 1,
        'context.preferredTime': 1,
        'context.dailyMessageCount': 1,
        'context.bookingConfirmed': 1,
        'context.bookingCancelled': 1,
        'context.flags.therapistQuery': 1,
        'context.lastActivity': 1,
        'context.flags.assistantName': 1
      })
      .sort({ 'context.lastActivity': -1 })
      .lean();

    const formatted = conversations.map(c => ({
      phone: formatPhone(c.customerPhone),
      name: c.context?.customerName || 'Guest',
      step: c.currentStep,
      service: c.context?.selectedService?.name || '—',
      duration: c.context?.selectedService?.duration ? `${c.context.selectedService.duration} min` : '—',
      price: c.context?.selectedService?.price ? `₹${c.context.selectedService.price}` : '—',
      date: c.context?.preferredDate || '—',
      time: c.context?.preferredTime || '—',
      dailyMessages: c.context?.dailyMessageCount || 0,
      bookingStatus: c.context?.bookingConfirmed ? 'Confirmed' : c.context?.bookingCancelled ? 'Cancelled' : 'In Progress',
      therapistQuery: c.context?.flags?.therapistQuery || false,
      lastActivity: c.context?.lastActivity,
      assistantName: c.context?.flags?.assistantName || 'Kiara'
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations',
      error: error.message
    });
  }
});

router.get('/conversations/:phone', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const { phone } = req.params;
    const { limit = 50 } = req.query;

    const history = await ConversationHistory.find({ userId, customerPhone: phone })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string))
      .select('messageType message aiResponse step timestamp context')
      .lean();

    const state = await ConversationState.findOne({ userId, customerPhone: phone, isActive: true })
      .select('currentStep context')
      .lean();

    res.json({
      success: true,
      data: {
        history: history.reverse().map(h => ({
          type: h.messageType,
          message: h.message,
          aiResponse: h.aiResponse,
          step: h.step,
          context: h.context,
          time: h.timestamp
        })),
        currentState: {
          step: state?.currentStep || 'ended',
          context: state?.context || {}
        }
      }
    });
  } catch (error: any) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversation history',
      error: error.message
    });
  }
});

router.post('/conversations/:phone/end', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const { phone } = req.params;

    await ConversationState.findOneAndUpdate(
      { userId, customerPhone: phone, isActive: true },
      {
        isActive: false,
        $set: {
          'context.dailyMessageCount': 0,
          'context.lastMessageDate': null,
          'context.bookingConfirmed': false,
          'context.bookingCancelled': false,
          'context.flags.therapistQuery': false,
          'context.browserQuestionCount': 0,
          'context.lastUserMessage': '',
          'context.lastAiMessage': '',
          'context.lastAiAt': null,
          'context.suppressWelcomeUntil': null
        }
      }
    );

    res.json({
      success: true,
      message: 'Conversation ended and context reset'
    });
  } catch (error: any) {
    console.error('Error ending conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error ending conversation',
      error: error.message
    });
  }
});

router.get('/reminders', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;

    const states = await ConversationState.find({
      userId,
      isActive: true,
      'context.bookingConfirmed': true
    })
      .select('customerPhone context')
      .lean();

    const pending = states
      .map(s => {
        const ctx = s.context as any;
        // Placeholder logic; replace with date-fns for real parsing
        const isSoon = Math.random() < 0.1; // Demo
        if (isSoon) {
          return {
            phone: formatPhone(s.customerPhone),
            name: ctx.customerName || 'Guest',
            service: ctx.selectedService?.name,
            dateTime: `${ctx.preferredDate} ${ctx.preferredTime}`,
            lastActivity: ctx.lastActivity
          };
        }
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: pending,
      count: pending.length
    });
  } catch (error: any) {
    console.error('Error getting reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reminders',
      error: error.message
    });
  }
});

router.get('/rules', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const rules = await AutoReplyRule.find({ userId }).sort({ priority: -1 });

    res.json({
      success: true,
      data: rules
    });
  } catch (error: any) {
    console.error('Error getting auto-reply rules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching auto-reply rules',
      error: error.message
    });
  }
});

router.post('/rules', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const ruleData = { ...req.body, userId };

    const rule = new AutoReplyRule(ruleData);
    await rule.save();

    res.json({
      success: true,
      data: rule,
      message: 'Auto-reply rule created successfully'
    });
  } catch (error: any) {
    console.error('Error creating auto-reply rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating auto-reply rule',
      error: error.message
    });
  }
});

router.put('/rules/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const { id } = req.params;
    const updateData = req.body;

    const rule = await AutoReplyRule.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true }
    );

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Auto-reply rule not found'
      });
    }

    res.json({
      success: true,
      data: rule,
      message: 'Auto-reply rule updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating auto-reply rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating auto-reply rule',
      error: error.message
    });
  }
});

router.delete('/rules/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!._id;
    const { id } = req.params;

    const rule = await AutoReplyRule.findOneAndDelete({ _id: id, userId });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Auto-reply rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Auto-reply rule deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting auto-reply rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting auto-reply rule',
      error: error.message
    });
  }
});

export default router;