import mongoose, { Document, Schema } from 'mongoose';

export interface IConversationHistory extends Document {
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;
  contactId?: mongoose.Types.ObjectId;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    autoReplyId?: mongoose.Types.ObjectId;
  }>;
  lastMessageAt: Date;
  messageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationHistorySchema = new Schema<IConversationHistory>({
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
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: [2000, 'Message content cannot exceed 2000 characters']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    autoReplyId: {
      type: Schema.Types.ObjectId,
      ref: 'AutoReply'
    }
  }],
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  messageCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
ConversationHistorySchema.index({ userId: 1, phoneNumber: 1 });
ConversationHistorySchema.index({ userId: 1, lastMessageAt: -1 });

// TTL index to automatically delete old conversations after 30 days of inactivity
ConversationHistorySchema.index({ lastMessageAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Method to add a message to conversation
ConversationHistorySchema.methods.addMessage = function(role: 'user' | 'assistant', content: string, autoReplyId?: mongoose.Types.ObjectId) {
  // Keep only last 10 messages for context (to prevent too much data)
  if (this.messages.length >= 10) {
    this.messages = this.messages.slice(-9); // Keep last 9, will add 1 more
  }
  
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    autoReplyId
  });
  
  this.lastMessageAt = new Date();
  this.messageCount += 1;
};

// Method to get recent messages for context
ConversationHistorySchema.methods.getRecentMessages = function(limit: number = 5) {
  return this.messages.slice(-limit);
};

export default mongoose.model<IConversationHistory>('ConversationHistory', ConversationHistorySchema);

