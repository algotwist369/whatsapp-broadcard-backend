import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import AutoReply from '../models/AutoReply';
import AutoReplyLog from '../models/AutoReplyLog';
import ReplyData from '../models/ReplyData';
import Contact from '../models/Contact';
import autoReplyService from '../services/autoReplyService';
import aiService from '../services/aiService';
import whatsappService from '../services/whatsappService';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `reply-data-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// @route   GET /api/auto-reply
// @desc    Get all auto-replies for user
// @access  Private
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { page = 1, limit = 10, category, isActive } = req.query;

    const query: any = { userId: user._id };
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const autoReplies = await AutoReply.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await AutoReply.countDocuments(query);

    res.json({
      success: true,
      data: {
        autoReplies,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get auto-replies error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply
// @desc    Create new auto-reply
// @access  Private
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const autoReplyData = {
      ...req.body,
      userId: user._id
    };

    const autoReply = new AutoReply(autoReplyData);
    await autoReply.save();

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.status(201).json({
      success: true,
      message: 'Auto-reply created successfully',
      data: autoReply
    });
  } catch (error) {
    console.error('Create auto-reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/auto-reply/:id
// @desc    Update auto-reply
// @access  Private
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const autoReply = await AutoReply.findOneAndUpdate(
      { _id: id, userId: user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!autoReply) {
      return res.status(404).json({
        success: false,
        message: 'Auto-reply not found'
      });
    }

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.json({
      success: true,
      message: 'Auto-reply updated successfully',
      data: autoReply
    });
  } catch (error) {
    console.error('Update auto-reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/auto-reply/:id
// @desc    Delete auto-reply
// @access  Private
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const autoReply = await AutoReply.findOneAndDelete({
      _id: id,
      userId: user._id
    });

    if (!autoReply) {
      return res.status(404).json({
        success: false,
        message: 'Auto-reply not found'
      });
    }

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.json({
      success: true,
      message: 'Auto-reply deleted successfully'
    });
  } catch (error) {
    console.error('Delete auto-reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply/:id/toggle
// @desc    Toggle auto-reply active status
// @access  Private
router.post('/:id/toggle', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const autoReply = await AutoReply.findOne({ _id: id, userId: user._id });
    if (!autoReply) {
      return res.status(404).json({
        success: false,
        message: 'Auto-reply not found'
      });
    }

    autoReply.isActive = !autoReply.isActive;
    await autoReply.save();

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.json({
      success: true,
      message: `Auto-reply ${autoReply.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: autoReply.isActive }
    });
  } catch (error) {
    console.error('Toggle auto-reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auto-reply/logs
// @desc    Get auto-reply logs
// @access  Private
router.get('/logs', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { page = 1, limit = 20, status, autoReplyId } = req.query;

    const query: any = { userId: user._id };
    if (status) query.status = status;
    if (autoReplyId) query.autoReplyId = autoReplyId;

    const logs = await AutoReplyLog.find(query)
      .populate('autoReplyId', 'name category')
      .populate('contactId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await AutoReplyLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get auto-reply logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply/test
// @desc    Test auto-reply with sample message
// @access  Private
router.post('/test', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
    }

    // Check if WhatsApp is connected
    if (!whatsappService.isConnected(user._id.toString())) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp is not connected. Please connect first.'
      });
    }

    const result = await autoReplyService.processIncomingMessage(
      user._id.toString(),
      phoneNumber,
      message
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Test auto-reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auto-reply/statistics
// @desc    Get auto-reply statistics
// @access  Private
router.get('/statistics', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { period = '30' } = req.query;

    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await AutoReplyLog.aggregate([
      {
        $match: {
          userId: user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const autoReplyStats = await AutoReply.aggregate([
      {
        $match: { userId: user._id }
      },
      {
        $group: {
          _id: null,
          totalAutoReplies: { $sum: 1 },
          activeAutoReplies: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          totalTriggers: { $sum: '$statistics.totalTriggers' },
          successfulReplies: { $sum: '$statistics.successfulReplies' },
          failedReplies: { $sum: '$statistics.failedReplies' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        logStats: stats,
        autoReplyStats: autoReplyStats[0] || {
          totalAutoReplies: 0,
          activeAutoReplies: 0,
          totalTriggers: 0,
          successfulReplies: 0,
          failedReplies: 0
        }
      }
    });
  } catch (error) {
    console.error('Get auto-reply statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reply Data Routes

// @route   GET /api/auto-reply/data
// @desc    Get reply data sets
// @access  Private
router.get('/data', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { page = 1, limit = 10, category, dataType } = req.query;

    const query: any = { userId: user._id };
    if (category) query.category = category;
    if (dataType) query.dataType = dataType;

    const replyData = await ReplyData.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await ReplyData.countDocuments(query);

    res.json({
      success: true,
      data: {
        replyData,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Get reply data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply/data
// @desc    Create new reply data set
// @access  Private
router.post('/data', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const replyData = new ReplyData({
      ...req.body,
      userId: user._id
    });

    await replyData.save();

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.status(201).json({
      success: true,
      message: 'Reply data created successfully',
      data: replyData
    });
  } catch (error) {
    console.error('Create reply data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply/data/upload
// @desc    Upload Excel file and import reply data
// @access  Private
router.post('/data/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { name, description, category } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Read Excel file
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in the Excel file'
      });
    }

    // Process the data
    const processedData = jsonData.map((row: any, index: number) => {
      const keys = Object.keys(row);
      const keyColumn = keys.find(k => 
        k.toLowerCase().includes('question') || 
        k.toLowerCase().includes('key') || 
        k.toLowerCase().includes('trigger')
      ) || keys[0];
      
      const valueColumn = keys.find(k => 
        k.toLowerCase().includes('answer') || 
        k.toLowerCase().includes('value') || 
        k.toLowerCase().includes('response')
      ) || keys[1];

      return {
        key: String(row[keyColumn] || ''),
        value: String(row[valueColumn] || ''),
        context: String(row.context || ''),
        tags: String(row.tags || '').split(',').map(t => t.trim()).filter(t => t),
        priority: parseInt(row.priority) || 1
      };
    }).filter(item => item.key && item.value);

    // Create reply data record
    const replyData = new ReplyData({
      userId: user._id,
      name: name || `Imported Data ${new Date().toISOString()}`,
      description: description || 'Imported from Excel file',
      category: category || 'general',
      dataType: 'excel_import',
      sourceFile: req.file.originalname,
      data: processedData,
      importMetadata: {
        totalRows: jsonData.length,
        importedRows: processedData.length,
        skippedRows: jsonData.length - processedData.length,
        importDate: new Date(),
        fileSize: req.file.size,
        columns: Object.keys(jsonData[0] || {})
      }
    });

    await replyData.save();

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.status(201).json({
      success: true,
      message: 'Reply data imported successfully',
      data: {
        id: replyData._id,
        name: replyData.name,
        totalRows: replyData.importMetadata?.totalRows,
        importedRows: replyData.importMetadata?.importedRows,
        skippedRows: replyData.importMetadata?.skippedRows
      }
    });
  } catch (error) {
    console.error('Upload reply data error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auto-reply/data/:id/test
// @desc    Test reply data with sample message
// @access  Private
router.post('/data/:id/test', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const replyData = await ReplyData.findOne({ _id: id, userId: user._id });
    if (!replyData) {
      return res.status(404).json({
        success: false,
        message: 'Reply data not found'
      });
    }

    // Removed: findBestReplyFromData method - no longer using manual data
    // System now uses PDF RAG only
    res.json({
      success: false,
      message: 'Manual data system removed. Please use Knowledge Base with PDFs instead.'
    });
  } catch (error) {
    console.error('Test reply data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/auto-reply/data/:id
// @desc    Delete reply data set
// @access  Private
router.delete('/data/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const replyData = await ReplyData.findOneAndDelete({
      _id: id,
      userId: user._id
    });

    if (!replyData) {
      return res.status(404).json({
        success: false,
        message: 'Reply data not found'
      });
    }

    // Clear cache for this user
    autoReplyService.clearUserCache(user._id.toString());

    res.json({
      success: true,
      message: 'Reply data deleted successfully'
    });
  } catch (error) {
    console.error('Delete reply data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
