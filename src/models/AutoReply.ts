import mongoose, { Document, Schema } from 'mongoose';

export interface IAutoReply extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  triggerKeywords: string[];
  triggerPatterns: string[]; // Regex patterns for advanced matching
  responseTemplate: string;
  responseType: 'text' | 'template' | 'ai_generated';
  category: string;
  priority: number; // Higher number = higher priority
  conditions: {
    timeRestrictions?: {
      startTime?: string; // HH:MM format
      endTime?: string; // HH:MM format
      daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    };
    contactFilters?: {
      categories?: string[];
      tags?: string[];
      excludeContacts?: mongoose.Types.ObjectId[];
    };
    messageFilters?: {
      minLength?: number;
      maxLength?: number;
      containsAny?: string[];
      containsAll?: string[];
    };
  };
  aiSettings?: {
    useAI: boolean;
    personality: 'professional' | 'friendly' | 'casual' | 'formal';
    contextAware: boolean;
    includeGreeting: boolean;
    includeClosing: boolean;
  };
  statistics: {
    totalTriggers: number;
    successfulReplies: number;
    failedReplies: number;
    lastTriggered?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AutoReplySchema = new Schema<IAutoReply>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Auto-reply name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  triggerKeywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  triggerPatterns: [{
    type: String,
    trim: true
  }],
  responseTemplate: {
    type: String,
    required: function() {
      return this.responseType !== 'ai_generated';
    },
    maxlength: [4096, 'Response template cannot exceed 4096 characters']
  },
  responseType: {
    type: String,
    enum: ['text', 'template', 'ai_generated'],
    default: 'text'
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  priority: {
    type: Number,
    default: 1,
    min: [1, 'Priority must be at least 1'],
    max: [10, 'Priority cannot exceed 10']
  },
  conditions: {
    timeRestrictions: {
      startTime: {
        type: String,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
      },
      endTime: {
        type: String,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
      },
      daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6
      }]
    },
    contactFilters: {
      categories: [{
        type: String,
        trim: true
      }],
      tags: [{
        type: String,
        trim: true,
        lowercase: true
      }],
      excludeContacts: [{
        type: Schema.Types.ObjectId,
        ref: 'Contact'
      }]
    },
    messageFilters: {
      minLength: {
        type: Number,
        min: 0
      },
      maxLength: {
        type: Number,
        min: 0
      },
      containsAny: [{
        type: String,
        trim: true
      }],
      containsAll: [{
        type: String,
        trim: true
      }]
    }
  },
  aiSettings: {
    useAI: {
      type: Boolean,
      default: false
    },
    personality: {
      type: String,
      enum: ['professional', 'friendly', 'casual', 'formal'],
      default: 'professional'
    },
    contextAware: {
      type: Boolean,
      default: true
    },
    includeGreeting: {
      type: Boolean,
      default: true
    },
    includeClosing: {
      type: Boolean,
      default: true
    }
  },
  statistics: {
    totalTriggers: {
      type: Number,
      default: 0
    },
    successfulReplies: {
      type: Number,
      default: 0
    },
    failedReplies: {
      type: Number,
      default: 0
    },
    lastTriggered: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
AutoReplySchema.index({ userId: 1, isActive: 1 });
AutoReplySchema.index({ userId: 1, category: 1 });
AutoReplySchema.index({ triggerKeywords: 1 });
AutoReplySchema.index({ priority: -1, createdAt: -1 });

// Virtual for success rate
AutoReplySchema.virtual('successRate').get(function() {
  const total = this.statistics.successfulReplies + this.statistics.failedReplies;
  return total > 0 ? (this.statistics.successfulReplies / total) * 100 : 0;
});

export default mongoose.model<IAutoReply>('AutoReply', AutoReplySchema);
