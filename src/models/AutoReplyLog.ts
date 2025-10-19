import mongoose, { Document, Schema } from 'mongoose';

export interface IAutoReplyLog extends Document {
  userId: mongoose.Types.ObjectId;
  autoReplyId: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  incomingMessage: string;
  triggerKeyword?: string;
  triggerPattern?: string;
  originalResponse: string;
  finalResponse: string;
  responseType: 'text' | 'template' | 'ai_generated';
  status: 'success' | 'failed' | 'blocked';
  errorMessage?: string;
  processingTime: number; // in milliseconds
  aiProcessingTime?: number; // in milliseconds
  contextData?: {
    contactName?: string;
    contactCategory?: string;
    messageLength: number;
    messageTime: Date;
    previousMessages?: number; // count of previous messages from this contact
  };
  createdAt: Date;
}

const AutoReplyLogSchema = new Schema<IAutoReplyLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  autoReplyId: {
    type: Schema.Types.ObjectId,
    ref: 'AutoReply',
    required: [true, 'Auto-reply ID is required'],
    index: true
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    index: true
  },
  incomingMessage: {
    type: String,
    required: [true, 'Incoming message is required'],
    maxlength: [4096, 'Message cannot exceed 4096 characters']
  },
  triggerKeyword: {
    type: String,
    trim: true
  },
  triggerPattern: {
    type: String,
    trim: true
  },
  originalResponse: {
    type: String,
    required: [true, 'Original response is required'],
    maxlength: [4096, 'Response cannot exceed 4096 characters']
  },
  finalResponse: {
    type: String,
    required: [true, 'Final response is required'],
    maxlength: [4096, 'Response cannot exceed 4096 characters']
  },
  responseType: {
    type: String,
    enum: ['text', 'template', 'ai_generated'],
    required: [true, 'Response type is required']
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'blocked'],
    required: [true, 'Status is required'],
    index: true
  },
  errorMessage: {
    type: String,
    maxlength: [1000, 'Error message cannot exceed 1000 characters']
  },
  processingTime: {
    type: Number,
    required: [true, 'Processing time is required'],
    min: [0, 'Processing time cannot be negative']
  },
  aiProcessingTime: {
    type: Number,
    min: [0, 'AI processing time cannot be negative']
  },
  contextData: {
    contactName: {
      type: String,
      trim: true
    },
    contactCategory: {
      type: String,
      trim: true
    },
    messageLength: {
      type: Number,
      required: [true, 'Message length is required'],
      min: [0, 'Message length cannot be negative']
    },
    messageTime: {
      type: Date,
      required: [true, 'Message time is required']
    },
    previousMessages: {
      type: Number,
      default: 0,
      min: [0, 'Previous messages count cannot be negative']
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
AutoReplyLogSchema.index({ userId: 1, createdAt: -1 });
AutoReplyLogSchema.index({ autoReplyId: 1, createdAt: -1 });
AutoReplyLogSchema.index({ contactId: 1, createdAt: -1 });
AutoReplyLogSchema.index({ status: 1, createdAt: -1 });

// TTL index to automatically delete logs after 90 days
AutoReplyLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<IAutoReplyLog>('AutoReplyLog', AutoReplyLogSchema);
