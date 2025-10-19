import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getPerformanceMetrics, resetPerformanceMetrics } from '../middleware/performance';

const router = Router();

// Get performance metrics (admin only)
router.get('/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const metrics = getPerformanceMetrics();
    
    res.json({
      success: true,
      data: {
        ...metrics,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics'
    });
  }
});

// Reset performance metrics (admin only)
router.post('/metrics/reset', authenticate, async (req: Request, res: Response) => {
  try {
    resetPerformanceMetrics();
    
    res.json({
      success: true,
      message: 'Performance metrics reset successfully'
    });
  } catch (error) {
    console.error('Error resetting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset performance metrics'
    });
  }
});

// Health check with detailed system info
router.get('/health', async (req: Request, res: Response) => {
  try {
    const metrics = getPerformanceMetrics();
    
    res.json({
      success: true,
      status: 'healthy',
      data: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        performance: {
          averageResponseTime: Math.round(metrics.averageResponseTime),
          slowRequests: metrics.slowRequests,
          totalRequests: metrics.requestCount,
        },
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed'
    });
  }
});

export default router;
