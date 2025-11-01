import mongoose, { Document, Schema } from 'mongoose';

export interface IAutoReplyRule extends Document {
  userId: mongoose.Types.ObjectId;
  step: string;
  triggerKeywords: string[];
  responseTemplate: string;
  aiPrompt: string;
  isActive: boolean;
  priority: number;
  conditions: {
    minMessageCount?: number;
    maxMessageCount?: number;
    timeOfDay?: {
      start: string;
      end: string;
    };
    daysOfWeek?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const AutoReplyRuleSchema = new Schema<IAutoReplyRule>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  step: {
    type: String,
    required: true,
    enum: [
      'initial_inquiry',
      'service_selection',
      'service_details',
      'time_selection',
      'availability_check',
      'booking_confirmation',
      'booking_completed',
      'conversation_ended'
    ]
  },
  triggerKeywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  responseTemplate: {
    type: String,
    required: true,
    trim: true
  },
  aiPrompt: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  conditions: {
    minMessageCount: {
      type: Number,
      min: 0
    },
    maxMessageCount: {
      type: Number,
      min: 0
    },
    timeOfDay: {
      start: String,
      end: String
    },
    daysOfWeek: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }]
  }
}, {
  timestamps: true
});

// Index for efficient queries
AutoReplyRuleSchema.index({ userId: 1, step: 1, isActive: 1 });
AutoReplyRuleSchema.index({ priority: -1, isActive: 1 });

export default mongoose.model<IAutoReplyRule>('AutoReplyRule', AutoReplyRuleSchema);
