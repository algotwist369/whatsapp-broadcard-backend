/**
 * Production Configuration for Large-Scale WhatsApp Broadcasting
 * Optimized for handling 1000+ contacts per batch
 */

export const PRODUCTION_CONFIG = {
  // Message Queue Configuration
  messageQueue: {
    concurrency: 10, // Process 10 messages concurrently (increased from 5)
    batchSize: 50, // Process messages in batches of 50
    maxRetries: 3, // Max retry attempts per message
    retryBackoff: {
      type: 'exponential',
      delay: 3000, // 3 seconds initial delay
      maxDelay: 60000 // Max 60 seconds delay
    },
    timeout: 30000, // 30 seconds timeout per message
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs for debugging
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 2 // Max times a job can be stalled before failing
  },

  // WhatsApp Service Configuration
  whatsapp: {
    connectionTimeout: 120000, // 2 minutes for QR scan
    messageTimeout: 30000, // 30 seconds per message
    maxConnectionsPerUser: 1, // One connection per user
    reconnectAttempts: 3,
    reconnectDelay: 5000,
    healthCheckInterval: 60000, // Check connection health every minute
    sessionCleanupInterval: 3600000, // Clean old sessions every hour
    
    // Rate limiting to prevent bans
    rateLimit: {
      messagesPerMinute: 50, // Max 50 messages per minute per connection
      messagesPerHour: 1000, // Max 1000 messages per hour
      burstSize: 10, // Allow burst of 10 messages
      cooldownPeriod: 60000 // 1 minute cooldown after burst
    }
  },

  // AI Service Configuration
  ai: {
    timeout: 30000, // 30 seconds for AI requests
    maxTokens: 500, // Max tokens per generation
    temperature: 0.7, // Creativity level
    maxRetries: 3,
    cacheEnabled: true,
    cacheTTL: 3600000, // 1 hour cache
    batchProcessing: true,
    batchSize: 20, // Process 20 AI requests in parallel
    
    // Spam detection thresholds
    spamThresholds: {
      safe: 20,
      low: 40,
      medium: 60,
      high: 80,
      critical: 90
    },
    
    // Personalization settings
    personalization: {
      variationRange: 20, // 20 different variations
      similarityThreshold: 0.8, // Messages with >80% similarity need variation
      minUniqueWords: 5, // Minimum 5 unique words per message
      maxMessageLength: 1000 // Max 1000 characters per message
    }
  },

  // Database Configuration
  database: {
    mongodb: {
      maxPoolSize: 50, // Increased from 20 for high concurrency
      minPoolSize: 10, // Maintain at least 10 connections
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      
      // Write concern for high availability
      writeConcern: {
        w: 'majority',
        wtimeout: 5000
      },
      
      // Read preference for distributed reads
      readPreference: 'secondaryPreferred',
      
      // Enable compression
      compressors: ['snappy', 'zlib']
    },
    
    redis: {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      family: 4,
      
      // Redis cluster configuration
      cluster: {
        enabled: false, // Enable for Redis cluster
        nodes: [],
        options: {
          maxRedirections: 3,
          retryDelayOnFailover: 100
        }
      }
    }
  },

  // Performance & Monitoring
  performance: {
    // Request metrics
    slowRequestThreshold: 1000, // Log requests > 1 second
    metricsInterval: 60000, // Report metrics every minute
    
    // Memory management
    maxMemoryUsage: 0.8, // Alert if memory > 80%
    gcInterval: 300000, // Force GC every 5 minutes if needed
    
    // Response compression
    compressionLevel: 6,
    compressionThreshold: 1024, // Compress responses > 1KB
    
    // Connection pooling
    keepAliveTimeout: 65000,
    headersTimeout: 66000
  },

  // Security Configuration
  security: {
    // Rate limiting
    rateLimit: {
      windowMs: 60000, // 1 minute window
      maxRequests: {
        auth: 10, // 10 auth requests per minute
        api: 1000, // 1000 API requests per minute
        messages: 100, // 100 message endpoint requests per minute
        contacts: 200 // 200 contact endpoint requests per minute
      }
    },
    
    // JWT Configuration
    jwt: {
      expiresIn: '7d',
      refreshExpiresIn: '30d',
      issuer: 'whatsapp-broadcast',
      audience: 'whatsapp-broadcast-users'
    },
    
    // CORS
    cors: {
      maxAge: 86400, // 24 hours
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: 'json',
    destinations: ['console', 'file'],
    rotation: {
      maxFiles: 10,
      maxSize: '10m',
      compress: true
    },
    
    // Log specific events
    events: {
      whatsappConnection: true,
      messageDelivery: true,
      errors: true,
      performance: true,
      security: true
    }
  },

  // Message Delay Configuration
  messaging: {
    // Default delays (user can override)
    defaultDelay: 60, // 60 seconds between messages
    minDelay: 30, // Minimum 30 seconds
    maxDelay: 300, // Maximum 5 minutes
    
    // Adaptive delay based on time of day
    adaptiveDelay: {
      enabled: true,
      businessHours: { // 9 AM - 6 PM: shorter delays
        start: 9,
        end: 18,
        delay: 45
      },
      offHours: { // Off hours: longer delays
        delay: 90
      }
    },
    
    // Smart throttling
    throttling: {
      enabled: true,
      maxConcurrent: 10, // Max 10 concurrent messages
      backpressure: true, // Enable backpressure handling
      queueSizeLimit: 10000 // Max 10k messages in queue
    }
  },

  // Circuit Breaker Configuration
  circuitBreaker: {
    enabled: true,
    threshold: 5, // Open circuit after 5 failures
    timeout: 30000, // 30 seconds timeout
    resetTimeout: 60000, // Try to close circuit after 1 minute
    monitoringPeriod: 10000 // Monitor for failures every 10 seconds
  },

  // Health Check Configuration
  healthCheck: {
    enabled: true,
    interval: 30000, // Check every 30 seconds
    timeout: 5000, // 5 seconds timeout
    endpoints: {
      database: true,
      redis: true,
      whatsapp: true,
      ai: true
    }
  },

  // Cleanup & Maintenance
  maintenance: {
    // Old message cleanup
    messageRetention: {
      enabled: true,
      days: 90, // Keep messages for 90 days
      batchSize: 1000, // Delete 1000 at a time
      interval: 86400000 // Run daily
    },
    
    // Session cleanup
    sessionCleanup: {
      enabled: true,
      inactiveDays: 30, // Clean sessions inactive for 30 days
      interval: 86400000 // Run daily
    },
    
    // Cache cleanup
    cacheCleanup: {
      enabled: true,
      interval: 600000 // Clean every 10 minutes
    }
  }
};

// Environment-specific overrides
export const getConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return PRODUCTION_CONFIG;
  } else if (env === 'staging') {
    return {
      ...PRODUCTION_CONFIG,
      messageQueue: {
        ...PRODUCTION_CONFIG.messageQueue,
        concurrency: 5 // Lower concurrency for staging
      }
    };
  } else {
    return {
      ...PRODUCTION_CONFIG,
      messageQueue: {
        ...PRODUCTION_CONFIG.messageQueue,
        concurrency: 2 // Even lower for development
      },
      logging: {
        ...PRODUCTION_CONFIG.logging,
        level: 'debug'
      }
    };
  }
};

export default PRODUCTION_CONFIG;

