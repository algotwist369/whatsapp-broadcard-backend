import mongoose, { Document, Schema } from 'mongoose';

export interface IReplyData extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  category: string;
  dataType: 'excel_import' | 'manual_entry' | 'api_import';
  sourceFile?: string; // Original filename if imported from Excel
  data: Array<{
    key: string; // Question/trigger
    value: string; // Answer/response
    context?: string; // Additional context
    tags?: string[]; // For categorization
    priority?: number; // For response priority
  }>;
  isActive: boolean;
  importMetadata?: {
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    importDate: Date;
    fileSize?: number;
    columns: string[];
  };
  statistics: {
    totalQueries: number;
    successfulMatches: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ReplyDataSchema = new Schema<IReplyData>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Data name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  dataType: {
    type: String,
    enum: ['excel_import', 'manual_entry', 'api_import'],
    required: [true, 'Data type is required']
  },
  sourceFile: {
    type: String,
    trim: true
  },
  data: [{
    key: {
      type: String,
      required: [true, 'Data key is required'],
      trim: true,
      maxlength: [500, 'Key cannot exceed 500 characters']
    },
    value: {
      type: String,
      required: [true, 'Data value is required'],
      maxlength: [4096, 'Value cannot exceed 4096 characters']
    },
    context: {
      type: String,
      trim: true,
      maxlength: [1000, 'Context cannot exceed 1000 characters']
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    priority: {
      type: Number,
      default: 1,
      min: [1, 'Priority must be at least 1'],
      max: [10, 'Priority cannot exceed 10']
    }
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  importMetadata: {
    totalRows: {
      type: Number,
      min: [0, 'Total rows cannot be negative']
    },
    importedRows: {
      type: Number,
      min: [0, 'Imported rows cannot be negative']
    },
    skippedRows: {
      type: Number,
      min: [0, 'Skipped rows cannot be negative']
    },
    importDate: {
      type: Date
    },
    fileSize: {
      type: Number,
      min: [0, 'File size cannot be negative']
    },
    columns: [{
      type: String,
      trim: true
    }]
  },
  statistics: {
    totalQueries: {
      type: Number,
      default: 0
    },
    successfulMatches: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
ReplyDataSchema.index({ userId: 1, isActive: 1 });
ReplyDataSchema.index({ userId: 1, category: 1 });
ReplyDataSchema.index({ 'data.key': 'text', 'data.value': 'text' }); // Text search index
ReplyDataSchema.index({ 'data.tags': 1 });

// Virtual for match rate
ReplyDataSchema.virtual('matchRate').get(function() {
  return this.statistics.totalQueries > 0 
    ? (this.statistics.successfulMatches / this.statistics.totalQueries) * 100 
    : 0;
});

export default mongoose.model<IReplyData>('ReplyData', ReplyDataSchema);
