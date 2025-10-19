import mongoose, { Document, Schema } from 'mongoose';

export interface IPendingMessage extends Document {
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;
  contactId?: mongoose.Types.ObjectId;
  message: string;
  messageId?: string; // WhatsApp message ID if available
  receivedAt: Date;
  processingAttempts: number;
  lastAttemptAt?: Date;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  errorMessage?: string;
  autoReplyResult?: {
    shouldReply: boolean;
    response?: string;
    autoReplyId?: string;
    confidence?: number;
  };
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PendingMessageSchema = new Schema<IPendingMessage>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    index: true
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: 'Contact'
  },
  message: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [4096, 'Message cannot exceed 4096 characters']
  },
  messageId: {
    type: String,
    sparse: true,
    index: true
  },
  receivedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  processingAttempts: {
    type: Number,
    default: 0,
    max: [5, 'Maximum processing attempts is 5']
  },
  lastAttemptAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'processed', 'failed'],
    default: 'pending',
    index: true
  },
  errorMessage: {
    type: String
  },
  autoReplyResult: {
    shouldReply: Boolean,
    response: String,
    autoReplyId: String,
    confidence: Number
  },
  processedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
PendingMessageSchema.index({ userId: 1, status: 1, receivedAt: 1 });
PendingMessageSchema.index({ userId: 1, phoneNumber: 1, receivedAt: -1 });

// TTL index to automatically delete processed messages after 7 days
PendingMessageSchema.index({ processedAt: 1 }, { 
  expireAfterSeconds: 7 * 24 * 60 * 60,
  partialFilterExpression: { status: 'processed' }
});

// TTL index to automatically delete failed messages after 30 days
PendingMessageSchema.index({ updatedAt: 1 }, { 
  expireAfterSeconds: 30 * 24 * 60 * 60,
  partialFilterExpression: { status: 'failed' }
});

export default mongoose.model<IPendingMessage>('PendingMessage', PendingMessageSchema);

