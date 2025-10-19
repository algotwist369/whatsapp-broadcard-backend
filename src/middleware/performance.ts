import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  slowRequests: number;
  cacheHits: number;
  cacheMisses: number;
}

const metrics: PerformanceMetrics = {
  requestCount: 0,
  totalResponseTime: 0,
  averageResponseTime: 0,
  slowRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
};

// Enhanced performance middleware with caching
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  // Add request ID for tracking
  (req as any).requestId = requestId;
  (req as any).startTime = startTime;
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const responseTime = Date.now() - startTime;
    
    // Update metrics
    metrics.requestCount++;
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requestCount;
    
    // Track slow requests (> 1 second)
    if (responseTime > 1000) {
      metrics.slowRequests++;
      console.warn(`Slow request detected: ${req.method} ${req.path} - ${responseTime}ms (ID: ${requestId})`);
    }
    
    // Add performance headers
    res.set('X-Response-Time', `${responseTime}ms`);
    res.set('X-Request-ID', requestId);
    res.set('X-Cache-Status', (req as any).cacheHit ? 'HIT' : 'MISS');
    
    // Log performance for development
    if (process.env.NODE_ENV === 'development' && responseTime > 500) {
      console.log(`Performance: ${req.method} ${req.path} - ${responseTime}ms (ID: ${requestId})`);
    }
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Cache middleware for frequently accessed data
export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    const cacheKey = `cache:${req.originalUrl}:${JSON.stringify(req.query)}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        metrics.cacheHits++;
        (req as any).cacheHit = true;
        return res.json(JSON.parse(cached));
      }
      
      metrics.cacheMisses++;
      (req as any).cacheHit = false;
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(body: any) {
        // Cache the response
        redis.setex(cacheKey, ttl, JSON.stringify(body)).catch(console.error);
        return originalJson.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// Rate limiting with Redis
export const rateLimitMiddleware = (windowMs: number = 60000, maxRequests: number = 100) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const key = `rate_limit:${clientId}`;
    
    try {
      // Check if Redis is connected before using it
      if (redis.status !== 'ready') {
        console.log('Redis not ready, skipping rate limiting');
        return next();
      }
      
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }
      
      if (current > maxRequests) {
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later.',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());
      res.set('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      
      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Continue without rate limiting if Redis fails
      next();
    }
  };
};

export const getPerformanceMetrics = () => ({
  ...metrics,
  cacheHitRate: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100,
  slowRequestRate: metrics.slowRequests / metrics.requestCount * 100,
});

export const resetPerformanceMetrics = () => {
  metrics.requestCount = 0;
  metrics.totalResponseTime = 0;
  metrics.averageResponseTime = 0;
  metrics.slowRequests = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
};

// Global error handler with performance tracking
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const responseTime = Date.now() - (req as any).startTime;
  
  console.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    requestId: (req as any).requestId,
    responseTime: `${responseTime}ms`,
    timestamp: new Date().toISOString(),
  });
  
  // Don't expose stack traces in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    requestId: (req as any).requestId,
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};