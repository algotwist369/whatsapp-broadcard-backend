import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import KnowledgeBase from '../models/KnowledgeBase';
import ragService from '../services/ragService';

const router = Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/knowledge-base';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `kb-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'));
    }
  }
});

// @route   POST /api/knowledge-base/upload
// @desc    Upload PDF/TXT file for RAG system
// @access  Private
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { category, description } = req.body;

    if (!category) {
      // Delete uploaded file
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    console.log(`📤 Uploading knowledge base: ${file.originalname} for user: ${userId}`);

    // Process the file asynchronously
    const fileType = path.extname(file.originalname).substring(1) as 'pdf' | 'txt';

    // Start processing in background
    res.json({
      success: true,
      message: 'File uploaded successfully. Processing in background...',
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        category,
        status: 'processing'
      }
    });

    // Process file in background
    setImmediate(async () => {
      try {
        console.log(`🔄 Starting background processing for: ${file.originalname}`);
        
        const knowledgeBaseId = await ragService.processPDF(
          userId,
          file.path,
          file.originalname,
          category,
          description
        );

        console.log(`✅ Knowledge base processed successfully: ${knowledgeBaseId}`);

      } catch (processError) {
        console.error('❌ Error processing file in background:', processError);
        console.error('Stack trace:', processError instanceof Error ? processError.stack : 'No stack');

        // Create failed entry
        try {
          const kb = new KnowledgeBase({
            userId,
            fileName: file.originalname,
            originalFileName: file.originalname,
            fileType,
            filePath: file.path,
            fileSize: file.size,
            category,
            description,
            rawText: '',
            processedChunks: [],
            totalChunks: 0,
            processingStatus: 'failed',
            processingError: processError instanceof Error ? processError.message : 'Unknown error',
            isActive: false
          });

          await kb.save();
          console.log(`💾 Failed entry saved to database for debugging`);
        } catch (saveError) {
          console.error('❌ Failed to save error entry:', saveError);
        }
      }
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to upload file'
    });
  }
});

// @route   GET /api/knowledge-base
// @desc    Get all knowledge bases for user
// @access  Private
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();

    const knowledgeBases = await KnowledgeBase.find({
      userId: user._id
    }).select('-rawText -processedChunks').sort({ createdAt: -1 });

    const summary = await ragService.getUserKnowledgeSummary(userId);

    res.json({
      success: true,
      data: {
        knowledgeBases,
        summary
      }
    });

  } catch (error) {
    console.error('Get knowledge bases error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get knowledge bases'
    });
  }
});

// @route   GET /api/knowledge-base/:id
// @desc    Get specific knowledge base details
// @access  Private
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const kb = await KnowledgeBase.findOne({
      _id: id,
      userId: user._id
    });

    if (!kb) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found'
      });
    }

    res.json({
      success: true,
      data: kb
    });

  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get knowledge base'
    });
  }
});

// @route   DELETE /api/knowledge-base/:id
// @desc    Delete knowledge base
// @access  Private
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { id } = req.params;

    const deleted = await ragService.deleteKnowledgeBase(userId, id);

    if (deleted) {
      res.json({
        success: true,
        message: 'Knowledge base deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Knowledge base not found'
      });
    }

  } catch (error) {
    console.error('Delete knowledge base error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete knowledge base'
    });
  }
});

// @route   POST /api/knowledge-base/search
// @desc    Search knowledge base (for testing)
// @access  Private
router.post('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { query, topK = 3 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }

    const results = await ragService.searchKnowledge(userId, query, topK);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Search knowledge error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search knowledge base'
    });
  }
});

// @route   POST /api/knowledge-base/test-answer
// @desc    Test RAG answer generation
// @access  Private
router.post('/test-answer', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { query, customerName = 'Customer' } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }

    const answer = await ragService.generateAnswerFromKnowledge(
      userId,
      query,
      customerName,
      []
    );

    res.json({
      success: true,
      data: answer
    });

  } catch (error) {
    console.error('Test answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate answer'
    });
  }
});

// @route   PUT /api/knowledge-base/:id/activate
// @desc    Activate/deactivate knowledge base
// @access  Private
router.put('/:id/activate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userId = user._id.toString();
    const { id } = req.params;
    const { isActive } = req.body;

    const kb = await KnowledgeBase.findOneAndUpdate(
      { _id: id, userId: user._id },
      { isActive },
      { new: true }
    );

    if (!kb) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base not found'
      });
    }

    // Rebuild vector store
    ragService.clearUserCache(userId);
    await ragService.createVectorStore(userId);

    res.json({
      success: true,
      message: `Knowledge base ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: kb
    });

  } catch (error) {
    console.error('Activate knowledge base error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update knowledge base'
    });
  }
});

export default router;

