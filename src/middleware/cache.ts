import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
  skipCache?: boolean; // Skip caching for certain conditions
}

export const cache = (options: CacheOptions = {}) => {
  const { ttl = 300, key, skipCache = false } = options; // Default 5 minutes TTL

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip cache for non-GET requests or if skipCache is true
    if (req.method !== 'GET' || skipCache) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = key || `cache:${req.originalUrl}:${JSON.stringify(req.query)}`;
      
      // Try to get cached data
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        console.log(`Cache hit for key: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      // Cache miss - store original json method
      const originalJson = res.json;
      
      // Override res.json to cache the response
      res.json = function(body: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.setex(cacheKey, ttl, JSON.stringify(body))
            .catch(err => console.error('Cache set error:', err));
        }
        
        // Call original json method
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching if Redis fails
    }
  };
};

// Clear cache for specific patterns
export const clearCache = async (pattern: string) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} cache entries matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

// Cache invalidation middleware for specific routes
export const invalidateCache = (patterns: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original methods
    const originalJson = res.json;
    
    // Override res.json to invalidate cache after successful operations
    res.json = function(body: any) {
      // Only invalidate cache for successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(pattern => {
          clearCache(pattern).catch(err => console.error('Cache invalidation error:', err));
        });
      }
      
      return originalJson.call(this, body);
    };

    next();
  };
};
