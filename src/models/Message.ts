import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  userId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  originalMessage: string;
  aiRewrittenMessage: string;
  category: 'promotional' | 'notification' | 'advertising' | 'discount_offer' | 'information' | 'other';
  spamWords: string[];
  replacements: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'delivered' | 'read';
  whatsappMessageId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: [true, 'Contact ID is required'],
    index: true
  },
  originalMessage: {
    type: String,
    required: [true, 'Original message is required'],
    maxlength: [4096, 'Message cannot exceed 4096 characters']
  },
  aiRewrittenMessage: {
    type: String,
    required: [true, 'AI rewritten message is required'],
    maxlength: [4096, 'Message cannot exceed 4096 characters']
  },
  category: {
    type: String,
    enum: ['promotional', 'notification', 'advertising', 'discount_offer', 'information', 'other'],
    required: [true, 'Message category is required'],
    default: 'other'
  },
  spamWords: [{
    type: String,
    trim: true
  }],
  replacements: [{
    original: {
      type: String,
      required: true
    },
    replacement: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      required: true
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed', 'delivered', 'read'],
    default: 'pending',
    index: true
  },
  whatsappMessageId: {
    type: String,
    sparse: true
  },
  sentAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  errorMessage: {
    type: String
  },
  retryCount: {
    type: Number,
    default: 0,
    max: [3, 'Maximum retry count is 3']
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
MessageSchema.index({ userId: 1, status: 1 });
MessageSchema.index({ contactId: 1, createdAt: -1 });
MessageSchema.index({ createdAt: -1 });

// TTL index to automatically delete old messages after 90 days
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<IMessage>('Message', MessageSchema);
