import mongoose, { Document, Schema } from 'mongoose';

export interface IBulkMessage extends Document {
  userId: mongoose.Types.ObjectId;
  originalMessage: string;
  aiRewrittenMessage: string;
  category: 'promotional' | 'notification' | 'advertising' | 'discount_offer' | 'information' | 'other';
  selectedContacts: mongoose.Types.ObjectId[];
  totalContacts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
  spamWords: string[];
  replacements: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BulkMessageSchema = new Schema<IBulkMessage>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
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
  selectedContacts: [{
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  }],
  totalContacts: {
    type: Number,
    required: true,
    min: [1, 'At least one contact is required']
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  progress: {
    total: {
      type: Number,
      default: 0
    },
    sent: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    }
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
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
BulkMessageSchema.index({ userId: 1, status: 1 });
BulkMessageSchema.index({ createdAt: -1 });

// Virtual for progress percentage
BulkMessageSchema.virtual('progressPercentage').get(function() {
  if (this.progress.total === 0) return 0;
  return Math.round((this.progress.sent + this.progress.failed) / this.progress.total * 100);
});

// Method to update progress
BulkMessageSchema.methods.updateProgress = function(sent: number, failed: number) {
  this.progress.sent = sent;
  this.progress.failed = failed;
  this.progress.pending = this.progress.total - sent - failed;
  
  if (this.progress.pending === 0) {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  
  return this.save();
};

export default mongoose.model<IBulkMessage>('BulkMessage', BulkMessageSchema);
