import mongoose, { Document, Schema } from 'mongoose';

export interface IConversationState extends Document {
  userId: mongoose.Types.ObjectId;
  customerPhone: string;
  currentStep: string;
  context: {
    customerName?: string;
    customerPhone?: string;
    selectedService?: {
      name: string;
      description: string;
      variants: Array<{ duration: number; price: number }>;
      benefits: string[];
      duration: number;
      price: number;
    };
    preferredDate?: string;
    preferredTime?: string;
    messageCount: number;
    dailyMessageCount?: number;
    lastMessageDate?: string;
    conversationStarted: Date;
    lastActivity: Date;
    lastMessageAt?: Date;
    lastUserMessage?: string;
    lastAiMessage?: string;
    lastAiAt?: Date;
    welcomed?: boolean;
    flags?: { assistantName?: string; therapistQuery?: boolean;[key: string]: any };
    bookingConfirmed?: boolean;
    bookingCancelled?: boolean;
    lastBookedAt?: Date;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationStateSchema = new Schema<IConversationState>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  customerPhone: { type: String, required: true },
  currentStep: { type: String, default: 'greeting' },
  context: {
    type: Schema.Types.Mixed,
    default: () => ({
      messageCount: 0,
      dailyMessageCount: 0,
      lastMessageDate: new Date().toDateString(),
      conversationStarted: new Date(),
      lastActivity: new Date()
    })
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

ConversationStateSchema.index({ userId: 1, customerPhone: 1 }, { unique: true });
ConversationStateSchema.index({ isActive: 1, 'context.lastActivity': -1 });

export default mongoose.model<IConversationState>('ConversationState', ConversationStateSchema);