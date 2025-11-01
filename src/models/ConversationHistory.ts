import mongoose, { Document, Schema } from 'mongoose';

export interface IConversationHistory extends Document {
  userId: mongoose.Types.ObjectId;
  customerPhone: string;
  messageType: 'incoming' | 'outgoing';
  message: string;
  aiResponse?: string;
  step: string;
  context: any;
  timestamp: Date;
  isProcessed: boolean;
}

const ConversationHistorySchema = new Schema<IConversationHistory>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    required: true,
    enum: ['incoming', 'outgoing']
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  aiResponse: {
    type: String,
    trim: true
  },
  step: {
    type: String,
    required: true
  },
  context: {
    type: Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isProcessed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

ConversationHistorySchema.index({ userId: 1, customerPhone: 1, timestamp: -1 });
ConversationHistorySchema.index({ isProcessed: 1, timestamp: -1 });

export default mongoose.model<IConversationHistory>('ConversationHistory', ConversationHistorySchema);