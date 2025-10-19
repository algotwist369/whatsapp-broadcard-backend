import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  category?: string; // Contact category for personalization
  tags?: string[]; // Tags for better segmentation
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v: string) {
        // Remove all non-digit characters and check if it's a valid phone number
        const cleaned = v.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
      },
      message: 'Phone number must be between 10-15 digits'
    }
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  category: {
    type: String,
    trim: true,
    default: 'general',
    enum: ['general', 'vip', 'customer', 'lead', 'partner', 'other'],
    index: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for user and phone uniqueness
ContactSchema.index({ userId: 1, phone: 1 }, { unique: true });

// Additional indexes for performance
ContactSchema.index({ userId: 1, isActive: 1 }); // For filtering active contacts by user
ContactSchema.index({ phone: 1 }); // For phone number lookups
ContactSchema.index({ name: 'text', phone: 'text' }); // Text search index
ContactSchema.index({ createdAt: -1 }); // For sorting by creation date

// Virtual for formatted phone number
ContactSchema.virtual('formattedPhone').get(function() {
  const cleaned = this.phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
});

export default mongoose.model<IContact>('Contact', ContactSchema);
