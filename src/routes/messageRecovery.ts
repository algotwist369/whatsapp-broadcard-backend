import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import messageRecoveryService from '../services/messageRecoveryService';

const router = Router();

// @route   GET /api/recovery/stats
// @desc    Get recovery statistics for the user
// @access  Private
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const stats = await messageRecoveryService.getPendingStats(userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting recovery stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recovery statistics'
    });
  }
});

// @route   POST /api/recovery/process
// @desc    Manually trigger message recovery
// @access  Private
router.post('/process', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    console.log(`🔄 Manual recovery triggered by user: ${userId}`);

    // Check if recovery is needed
    const needsRecovery = await messageRecoveryService.needsRecovery(userId);
    
    if (!needsRecovery) {
      return res.json({
        success: true,
        message: 'No pending messages to recover',
        data: {
          totalPending: 0,
          processed: 0,
          replied: 0,
          failed: 0
        }
      });
    }

    // Process pending messages
    const result = await messageRecoveryService.processPendingMessages(userId);

    res.json({
      success: true,
      message: `Recovery completed: ${result.processed} messages processed, ${result.replied} replied`,
      data: result
    });

  } catch (error) {
    console.error('Error processing recovery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process message recovery'
    });
  }
});

// @route   POST /api/recovery/retry
// @desc    Retry failed messages
// @access  Private
router.post('/retry', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    console.log(`🔄 Retry failed messages triggered by user: ${userId}`);

    const result = await messageRecoveryService.retryFailedMessages(userId);

    res.json({
      success: true,
      message: `Retry completed: ${result.processed} messages processed, ${result.replied} replied`,
      data: result
    });

  } catch (error) {
    console.error('Error retrying failed messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry failed messages'
    });
  }
});

// @route   POST /api/recovery/cleanup
// @desc    Clean up old processed messages
// @access  Private
router.post('/cleanup', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { daysOld } = req.body;

    console.log(`🧹 Cleanup triggered by user: ${userId}, days: ${daysOld || 7}`);

    const deletedCount = await messageRecoveryService.cleanupOldMessages(
      userId,
      daysOld || 7
    );

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old messages`,
      data: { deletedCount }
    });

  } catch (error) {
    console.error('Error cleaning up messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up old messages'
    });
  }
});

export default router;

