import mongoose from 'mongoose';
import { createIndexes } from './database-indexes';
import env from './env';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-bulk-messaging';
    
    const options = {
      maxPoolSize: 50, // Increased for high concurrency (from 20)
      minPoolSize: 10, // Keep more connections ready (from 5)
      maxIdleTimeMS: 60000, // Keep connections longer for better reuse
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      retryReads: true,
      compressors: ['zlib'], // Enable compression for better network performance
      zlibCompressionLevel: 6, // Balanced compression
      readPreference: 'primaryPreferred', // Use primary, fallback to secondary
      w: 1, // Write concern - wait for acknowledgment from primary only (faster)
      journal: true, // Ensure writes are persisted
    };

    await mongoose.connect(mongoURI, options as mongoose.ConnectOptions);
    
    console.log('✅ MongoDB connected successfully');
    
    // Create indexes for performance
    await createIndexes();
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('🔒 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;
