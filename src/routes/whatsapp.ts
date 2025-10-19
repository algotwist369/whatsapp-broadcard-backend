import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import User from '../models/User';
import whatsappService from '../services/whatsappService';

const router = Router();

// @route   POST /api/whatsapp/connect
// @desc    Connect WhatsApp account
// @access  Private
router.post('/connect', authenticate, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    // Check if already connected (synchronous check only)
    if (user.whatsappConnected) {
      const isStillConnected = whatsappService.isConnected(userId);
      if (isStillConnected) {
        return res.json({
          success: true,
          message: 'WhatsApp is already connected',
          data: { isConnected: true }
        });
      }
    }

    // Return immediately - no async processing
    console.log('Connection initiated, returning immediately for faster response');
    res.json({
      success: true,
      message: 'Connection initiated. QR code will appear via real-time updates.',
      data: {
        qr: null,
        isConnected: false
      }
    });

    // Process connection asynchronously in the background
    // Use setTimeout to ensure response is sent first
    setTimeout(async () => {
      try {
        const userSettings = user.settings || {};
        const result = await whatsappService.createConnection(userId, userSettings);
        
        if (result.success && result.qr) {
          // Update user's WhatsApp connection status
          await User.findByIdAndUpdate(userId, { whatsappConnected: false });
        }
      } catch (error) {
        console.error('Background connection error:', error);
      }
    }, 0);

  } catch (error) {
    console.error('WhatsApp connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during WhatsApp connection'
    });
  }
});

// @route   GET /api/whatsapp/status
// @desc    Get WhatsApp connection status
// @access  Private
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const status = whatsappService.getConnectionStatus(userId);
    const qr = whatsappService.getQRCode(userId);

    console.log('Status check:', { 
      userId, 
      isConnected: status.isConnected, 
      state: status.state, 
      hasQR: !!qr,
      dbStatus: user.whatsappConnected
    });

    // If user has WhatsApp connected in database but no active connection, try to restore
    if (user.whatsappConnected && !status.isConnected && status.state === 'not_connected') {
      console.log('User has WhatsApp connected in DB but no active connection, attempting restore...');
      
      // Check if session files exist
      const hasSession = whatsappService.hasExistingSession(userId);
      if (!hasSession) {
        console.log('No session files found, marking as disconnected');
        await User.findByIdAndUpdate(userId, { whatsappConnected: false });
        return res.json({
          success: true,
          data: {
            isConnected: false,
            state: 'not_connected',
            qr: null
          }
        });
      }
      
      try {
        // Start restoration in background to avoid blocking the response
        console.log('Starting background restoration for user:', userId);
        
        // Return immediately with restoring state
        res.json({
          success: true,
          data: {
            isConnected: false,
            state: 'restoring',
            qr: null
          }
        });
        
        // Restore connection in background
        whatsappService.restoreUserConnection(userId).then((restoreResult) => {
          if (restoreResult) {
            console.log('✅ Background restoration completed for user:', userId);
          } else {
            console.log('❌ Background restoration failed for user:', userId);
            User.findByIdAndUpdate(userId, { whatsappConnected: false });
          }
        }).catch((error) => {
          console.error('❌ Background restoration error for user:', userId, error);
          User.findByIdAndUpdate(userId, { whatsappConnected: false });
        });
        
        // Already sent response, so return to avoid sending it twice
        return;
      } catch (error) {
        console.error('Error initiating restoration:', error);
        // Update database if restoration fails
        await User.findByIdAndUpdate(userId, { whatsappConnected: false });
      }
    }

    // If we have an active connection attempt, don't override it with stale status
    if (status.state === 'connecting' && qr) {
      console.log('Active connection in progress, returning current state');
      return res.json({
        success: true,
        data: {
          isConnected: status.isConnected,
          state: status.state,
          qr: qr
        }
      });
    }

    // Update user's connection status in database if there's a mismatch
    if (status.isConnected !== user.whatsappConnected) {
      await User.findByIdAndUpdate(userId, { 
        whatsappConnected: status.isConnected 
      });
      console.log('Updated user WhatsApp connection status:', status.isConnected);
    }

    res.json({
      success: true,
      data: {
        isConnected: status.isConnected,
        state: status.state,
        qr: qr
      }
    });

  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/whatsapp/qr
// @desc    Get QR code for WhatsApp connection
// @access  Private
router.get('/qr', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const isConnected = whatsappService.isConnected(userId);

    if (isConnected) {
      return res.json({
        success: true,
        message: 'WhatsApp is already connected',
        data: { isConnected: true }
      });
    }

    // Check if user has an active connection attempt
    if (!whatsappService.hasActiveConnection(userId)) {
      return res.status(400).json({
        success: false,
        message: 'No active connection. Please initiate connection first.'
      });
    }

    // Try to get existing QR code first
    let qr = whatsappService.getQRCode(userId);
    
    // If no QR code, wait for it to be generated
    if (!qr) {
      console.log('No QR code found, waiting for generation...');
      qr = await whatsappService.waitForQRCode(userId, 5000); // Wait up to 5 seconds for faster response
    }

    if (!qr) {
      return res.status(404).json({
        success: false,
        message: 'QR code not available. Please try connecting again.'
      });
    }

    res.json({
      success: true,
      data: {
        qr,
        isConnected: false
      }
    });

  } catch (error) {
    console.error('QR code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/whatsapp/disconnect
// @desc    Disconnect WhatsApp account
// @access  Private
router.post('/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const disconnected = await whatsappService.disconnect(userId);

    if (disconnected) {
      // Update user's connection status
      await User.findByIdAndUpdate(userId, { 
        whatsappConnected: false,
        whatsappSessionId: null
      });

      // Emit real-time disconnect status update
      const io = req.app.get('io');
      if (io) {
        console.log('📡 Emitting manual disconnect status update for user:', userId);
        io.to(`user-${userId}`).emit('whatsapp-status-update', {
          isConnected: false,
          state: 'disconnected',
          qr: null
        });
        
        // Also emit a follow-up update
        setTimeout(() => {
          console.log('📡 Sending follow-up manual disconnect status update for user:', userId);
          io.to(`user-${userId}`).emit('whatsapp-status-update', {
            isConnected: false,
            state: 'disconnected',
            qr: null
          });
        }, 100);
      }

      res.json({
        success: true,
        message: 'WhatsApp disconnected successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'WhatsApp was not connected or already disconnected'
      });
    }

  } catch (error) {
    console.error('WhatsApp disconnection error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during disconnection'
    });
  }
});

// @route   GET /api/whatsapp/debug
// @desc    Get debug information about WhatsApp connections
// @access  Private
router.get('/debug', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const connectionInfo = whatsappService.getConnectionInfo(userId);
    const hasSession = whatsappService.hasExistingSession(userId);
    const activeConnections = whatsappService.getActiveConnectionsCount();

    res.json({
      success: true,
      data: {
        userId,
        userWhatsappConnected: user.whatsappConnected,
        connectionInfo,
        hasSession,
        activeConnections,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Debug info error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
