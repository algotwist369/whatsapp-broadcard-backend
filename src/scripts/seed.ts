import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/database';
import User from '../models/User';
import SpaData from '../models/SpaData';
import ConversationState from '../models/ConversationState';
import ConversationHistory from '../models/ConversationHistory';
import AutoReplyRule from '../models/AutoReplyRule';
import Message from '../models/Message';
import Contact from '../models/Contact';

async function dropIfExists(name: string): Promise<void> {
  const existing = await mongoose.connection.db
    .listCollections({ name })
    .toArray();
  if (existing.length > 0) {
    console.log(`🗑️  Dropping collection: ${name}`);
    await mongoose.connection.db.dropCollection(name);
  }
}

async function run() {
  try {
    await connectDB();

    // Drop app collections (safe reset)
    await dropIfExists('users');
    await dropIfExists('spadatas');
    await dropIfExists('conversationstates');
    await dropIfExists('conversationhistories');
    await dropIfExists('autoreplyrules');
    await dropIfExists('messages');
    await dropIfExists('contacts');

    // Create a default admin/test user
    const user = await User.create({
      name: 'Spa Admin',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@aquamspa.com',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
      phone: '+91 90000 00000'
    });

    // Insert default SpaData with full details (variants, map, discounts)
    await SpaData.create({
      userId: user._id,
      spaName: 'Aquam Spa',
      location: 'Thane, Maharashtra',
      address: 'Aquam Spa, Ghodbunder Road, Thane',
      phone: '+91 1234567890',
      email: 'info@aquamspa.com',
      adminPhone: '7388480128',
      mapUrl: 'https://maps.app.goo.gl/1234567890',
      discounts: 'First visit 20% off! Weekday happy hours 2-5 PM',
      services: [
        {
          name: 'Swedish Massage',
          description: 'Full-body relaxation with gentle strokes',
          variants: [
            { duration: 60, price: 1999 },
            { duration: 90, price: 2799 },
            { duration: 120, price: 3499 }
          ],
          benefits: ['Reduces stress', 'Improves circulation', 'Relieves muscle tension']
        },
        {
          name: 'Deep Tissue Massage',
          description: 'Therapeutic massage targeting deep muscle layers for pain relief',
          variants: [
            { duration: 60, price: 2799 },
            { duration: 90, price: 3799 }
          ],
          benefits: ['Muscle recovery', 'Pain relief', 'Improves flexibility']
        },
        {
          name: 'Balinese Massage',
          description: 'Luxury massage with deep relaxation techniques',
          variants: [
            { duration: 90, price: 3299 }
          ],
          benefits: ['Deep relaxation', 'Stress relief', 'Improved sleep']
        },
        {
          name: 'Head Massage',
          description: 'Relieves tension in head, neck & shoulders',
          variants: [
            { duration: 30, price: 999 },
            { duration: 45, price: 1499 }
          ],
          benefits: ['Reduces headache', 'Improves focus']
        }
      ],
      workingHours: [
        { day: 'Monday', openTime: '10:00', closeTime: '21:00', isOpen: true },
        { day: 'Tuesday', openTime: '10:00', closeTime: '21:00', isOpen: true },
        { day: 'Wednesday', openTime: '10:00', closeTime: '21:00', isOpen: true },
        { day: 'Thursday', openTime: '10:00', closeTime: '21:00', isOpen: true },
        { day: 'Friday', openTime: '10:00', closeTime: '22:00', isOpen: true },
        { day: 'Saturday', openTime: '10:00', closeTime: '22:00', isOpen: true },
        { day: 'Sunday', openTime: '10:00', closeTime: '20:00', isOpen: true }
      ],
      bookingSettings: {
        advanceBookingDays: 30,
        slotDuration: 60,
        bufferTime: 15
      },
      autoReplySettings: {
        isEnabled: true,
        welcomeMessage: 'Hello! Thank you for reaching out to {spaName}. How can I help you today?',
        fallbackMessage: 'I\'m sorry, I didn\'t understand that. Could you please rephrase your question?',
        bookingConfirmationMessage: 'Thank you! Your booking has been successfully confirmed. 🎉',
        adminNotificationMessage: 'New booking received: {customerName} - {service} - {date} at {time}'
      }
    });

    console.log('✅ Seed complete. Default user and spa data created.');

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();


