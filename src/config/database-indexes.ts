import mongoose from 'mongoose';

// Database indexing for performance optimization
export const createIndexes = async () => {
  try {
    // Helper function to create index with error handling
    const createIndexSafely = async (collection: any, indexSpec: any, options: any = {}) => {
      try {
        await collection.createIndex(indexSpec, options);
        console.log(`✅ Index created: ${JSON.stringify(indexSpec)}`);
      } catch (error: any) {
        if (error.code === 86 || error.codeName === 'IndexKeySpecsConflict') {
          console.log(`⚠️  Index already exists: ${JSON.stringify(indexSpec)}`);
        } else {
          console.error(`❌ Error creating index ${JSON.stringify(indexSpec)}:`, error.message);
        }
      }
    };

    // Contact indexes
    await createIndexSafely(mongoose.connection.db.collection('contacts'), { userId: 1 });
    await createIndexSafely(mongoose.connection.db.collection('contacts'), { phone: 1 });
    await createIndexSafely(mongoose.connection.db.collection('contacts'), { userId: 1, phone: 1 }, { unique: true });
    await createIndexSafely(mongoose.connection.db.collection('contacts'), { createdAt: -1 });

    // User indexes
    await createIndexSafely(mongoose.connection.db.collection('users'), { email: 1 }, { unique: true });
    await createIndexSafely(mongoose.connection.db.collection('users'), { whatsappConnected: 1 });

    // BulkMessage indexes
    await createIndexSafely(mongoose.connection.db.collection('bulkmessages'), { userId: 1 });
    await createIndexSafely(mongoose.connection.db.collection('bulkmessages'), { status: 1 });
    await createIndexSafely(mongoose.connection.db.collection('bulkmessages'), { createdAt: -1 });
    await createIndexSafely(mongoose.connection.db.collection('bulkmessages'), { userId: 1, status: 1 });

    // Message indexes
    await createIndexSafely(mongoose.connection.db.collection('messages'), { bulkMessageId: 1 });
    await createIndexSafely(mongoose.connection.db.collection('messages'), { contactId: 1 });
    await createIndexSafely(mongoose.connection.db.collection('messages'), { status: 1 });
    await createIndexSafely(mongoose.connection.db.collection('messages'), { createdAt: -1 });

    console.log('✅ Database indexes setup completed');
  } catch (error) {
    console.error('❌ Error setting up database indexes:', error);
  }
};
