import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  // Performance optimizations
  lazyConnect: false, // Connect immediately
  enableOfflineQueue: true, // Allow offline queue for better reliability
  // Connection pooling
  family: 4,
  keepAlive: 30000, // 30 seconds
});

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redis.on('ready', () => {
  console.log('🚀 Redis is ready to accept connections');
});

// Graceful shutdown
process.on('SIGINT', () => {
  redis.disconnect();
  console.log('🔒 Redis connection closed');
});

export default redis;
