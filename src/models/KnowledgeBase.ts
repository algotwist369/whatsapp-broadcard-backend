import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeBase extends Document {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  originalFileName: string;
  fileType: 'pdf' | 'txt' | 'doc' | 'docx';
  filePath: string;
  fileSize: number;
  category: 'business_details' | 'services' | 'pricing' | 'faq' | 'policies' | 'general';
  description?: string;
  
  // Parsed content
  rawText: string;
  processedChunks: Array<{
    text: string;
    embedding?: number[];
    chunkIndex: number;
    pageNumber?: number;
  }>;
  
  // Metadata
  totalPages?: number;
  totalChunks: number;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError?: string;
  
  // Vector search metadata
  embeddingModel: string;
  lastIndexedAt?: Date;
  
  // Usage statistics
  statistics: {
    queriesAnswered: number;
    lastUsed?: Date;
    successRate: number;
  };
  
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<IKnowledgeBase>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  originalFileName: {
    type: String,
    required: [true, 'Original file name is required'],
    trim: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'txt', 'doc', 'docx'],
    required: [true, 'File type is required']
  },
  filePath: {
    type: String,
    required: [true, 'File path is required']
  },
  fileSize: {
    type: Number,
    required: [true, 'File size is required'],
    max: [50 * 1024 * 1024, 'File size cannot exceed 50MB']
  },
  category: {
    type: String,
    enum: ['business_details', 'services', 'pricing', 'faq', 'policies', 'general'],
    required: [true, 'Category is required'],
    default: 'general',
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  rawText: {
    type: String,
    required: [true, 'Raw text is required']
  },
  processedChunks: [{
    text: {
      type: String,
      required: true,
      maxlength: [2000, 'Chunk text cannot exceed 2000 characters']
    },
    embedding: [{
      type: Number
    }],
    chunkIndex: {
      type: Number,
      required: true
    },
    pageNumber: {
      type: Number
    }
  }],
  totalPages: {
    type: Number
  },
  totalChunks: {
    type: Number,
    required: [true, 'Total chunks is required'],
    default: 0
  },
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  processingError: {
    type: String
  },
  embeddingModel: {
    type: String,
    default: 'text-embedding-3-small'
  },
  lastIndexedAt: {
    type: Date
  },
  statistics: {
    queriesAnswered: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    },
    successRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
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
KnowledgeBaseSchema.index({ userId: 1, isActive: 1, category: 1 });
KnowledgeBaseSchema.index({ userId: 1, processingStatus: 1 });
KnowledgeBaseSchema.index({ userId: 1, 'statistics.lastUsed': -1 });

// TTL index to automatically delete inactive knowledge bases after 180 days
KnowledgeBaseSchema.index({ updatedAt: 1 }, { 
  expireAfterSeconds: 180 * 24 * 60 * 60,
  partialFilterExpression: { isActive: false }
});

export default mongoose.model<IKnowledgeBase>('KnowledgeBase', KnowledgeBaseSchema);

