import mongoose, { Document, Schema } from 'mongoose';

export interface ISpaData extends Document {
  userId: mongoose.Types.ObjectId;
  spaName: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  adminPhone?: string;
  mapUrl: string;
  discounts: string;
  services: {
    name: string;
    description: string;
    variants: {
      duration: number;
      price: number;
    }[];
    benefits: string[];
  }[];
  workingHours: {
    day: string;
    openTime: string;
    closeTime: string;
    isOpen: boolean;
  }[];
  bookingSettings: {
    advanceBookingDays: number;
    slotDuration: number;
    bufferTime: number;
  };
  autoReplySettings: {
    isEnabled: boolean;
    welcomeMessage: string;
    fallbackMessage: string;
    bookingConfirmationMessage: string;
    adminNotificationMessage: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SpaDataSchema = new Schema<ISpaData>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  spaName: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  adminPhone: { type: String, trim: true }, // UPDATED: No default, use ENV fallback
  mapUrl: { type: String, trim: true, default: 'https://maps.app.goo.gl/1234567890' },
  discounts: { type: String, trim: true, default: 'First visit 20% off, next 10% off' }, // UPDATED: Default
  services: [{
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    variants: [{
      duration: { type: Number, required: true, min: 15 },
      price: { type: Number, required: true, min: 0 }
    }],
    benefits: [{ type: String, trim: true }]
  }],
  workingHours: [{
    day: { type: String, required: true, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    isOpen: { type: Boolean, default: true }
  }],
  bookingSettings: {
    advanceBookingDays: { type: Number, default: 30, min: 1, max: 365 },
    slotDuration: { type: Number, default: 60, min: 15 },
    bufferTime: { type: Number, default: 15, min: 0 }
  },
  autoReplySettings: {
    isEnabled: { type: Boolean, default: false },
    welcomeMessage: { type: String, default: "Hello! Thank you for reaching out to {spaName}. How can I help you today?" },
    fallbackMessage: { type: String, default: "I'm sorry, I didn't understand that. Could you please rephrase your question?" },
    bookingConfirmationMessage: { type: String, default: "Thank you! Your booking has been successfully confirmed." },
    adminNotificationMessage: { type: String, default: "New booking received: {customerName} - {service} - {date} at {time}" }
  }
}, { timestamps: true });

SpaDataSchema.index({ userId: 1 });

export default mongoose.model<ISpaData>('SpaData', SpaDataSchema);