const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-broadcast', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Contact = require('../models/Contact.js');

async function migrateContacts() {
  try {
    console.log('Starting contact migration...');
    
    // Find all contacts with the old user ID
    const oldUserId = '68d7acbc20c2e4a01a564e5e';
    const newUserId = '68d7bc0abf3f82daff12610a';
    
    const contacts = await Contact.find({ userId: oldUserId });
    console.log(`Found ${contacts.length} contacts to migrate`);
    
    if (contacts.length > 0) {
      // Update all contacts to belong to the new user
      const result = await Contact.updateMany(
        { userId: oldUserId },
        { userId: newUserId }
      );
      
      console.log(`Migrated ${result.modifiedCount} contacts to new user`);
      
      // Verify the migration
      const updatedContacts = await Contact.find({ userId: newUserId });
      console.log(`Verification: ${updatedContacts.length} contacts now belong to new user`);
    } else {
      console.log('No contacts found to migrate');
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

migrateContacts();
