import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { validate, contactSchema } from '../middleware/validation';
import Contact from '../models/Contact';
import multer from 'multer';
import XLSX from 'xlsx';
import { cache, invalidateCache } from '../middleware/cache';
import mongoose from 'mongoose';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// @route   GET /api/contacts/debug
// @desc    Debug endpoint to check user authentication and contacts
// @access  Private
router.get('/debug', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    
    // Get all contacts (including inactive ones)
    const allContacts = await Contact.find({ userId: user._id });
    
    res.json({
      success: true,
      data: {
        userId: user._id,
        userEmail: user.email,
        totalContacts: allContacts.length,
        activeContacts: allContacts.filter(c => c.isActive).length,
        inactiveContacts: allContacts.filter(c => !c.isActive).length,
        contacts: allContacts
      }
    });
  } catch (error) {
    console.error('Debug contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/contacts/migrate
// @desc    Migrate contacts from old user to current user
// @access  Private
router.post('/migrate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { oldUserId } = req.body;
    
    if (!oldUserId) {
      return res.status(400).json({
        success: false,
        message: 'Old user ID is required'
      });
    }
    
    // Find contacts with old user ID
    const contactsToMigrate = await Contact.find({ userId: oldUserId });
    console.log(`Found ${contactsToMigrate.length} contacts to migrate`);
    
    if (contactsToMigrate.length === 0) {
      return res.json({
        success: true,
        message: 'No contacts found to migrate',
        data: { migratedCount: 0 }
      });
    }
    
    // Update all contacts to belong to current user
    const result = await Contact.updateMany(
      { userId: oldUserId },
      { userId: user._id }
    );
    
    console.log(`Migrated ${result.modifiedCount} contacts to user ${user._id}`);
    
    res.json({
      success: true,
      message: `Successfully migrated ${result.modifiedCount} contacts`,
      data: { migratedCount: result.modifiedCount }
    });
    
  } catch (error) {
    console.error('Migrate contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/contacts
// @desc    Get all contacts for the authenticated user
// @access  Private
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { page = 1, limit = 50, search = '' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build search query - temporarily include both user IDs to handle migration
    let searchQuery: any = { 
      $or: [
        { userId: user._id, isActive: true },
        { userId: '68d7acbc20c2e4a01a564e5e', isActive: true } // Old user ID for migration
      ]
    };

    if (search) {
      searchQuery.$and = [
        searchQuery,
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }
      ];
    }


    const contacts = await Contact.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Contact.countDocuments(searchQuery);

    res.json({
      success: true,
      data: {
        contacts,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalContacts: total,
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/contacts
// @desc    Add a new contact
// @access  Private
router.post('/', authenticate, validate(contactSchema), invalidateCache(['cache:/api/contacts*']), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { name, phone, email } = req.body;

    // Normalize phone number
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Check if contact already exists (only active contacts)
    const existingContact = await Contact.findOne({ 
      userId: user._id, 
      phone: normalizedPhone,
      isActive: true
    });

    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'Contact with this phone number already exists'
      });
    }

    // Also check for any inactive contacts with the same phone (for recovery)
    const inactiveContact = await Contact.findOne({ 
      userId: user._id, 
      phone: normalizedPhone,
      isActive: false
    });

    if (inactiveContact) {
      // Reactivate the existing contact instead of creating a new one
      inactiveContact.name = name;
      inactiveContact.email = email || undefined;
      inactiveContact.isActive = true;
      await inactiveContact.save();

      return res.status(200).json({
        success: true,
        message: 'Contact reactivated successfully',
        data: { contact: inactiveContact }
      });
    }

    const contact = new Contact({
      userId: user._id,
      name,
      phone: normalizedPhone, // Use normalized phone
      email: email || undefined
    });

    await contact.save();

    res.status(201).json({
      success: true,
      message: 'Contact added successfully',
      data: { contact }
    });

  } catch (error) {
    console.error('Add contact error:', error);
    
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0].message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/contacts/:id
// @desc    Update a contact
// @access  Private
router.put('/:id', authenticate, validate(contactSchema), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { name, phone, email } = req.body;

    const contact = await Contact.findOne({ _id: id, userId: user._id });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Check if phone number is being changed and if it conflicts with another contact
    const newPhone = phone.replace(/\D/g, '');
    if (contact.phone !== newPhone) {
      const existingContact = await Contact.findOne({ 
        userId: user._id, 
        phone: newPhone,
        _id: { $ne: id }
      });

      if (existingContact) {
        return res.status(400).json({
          success: false,
          message: 'Another contact with this phone number already exists'
        });
      }
    }

    // Update contact
    contact.name = name;
    contact.phone = newPhone;
    contact.email = email || undefined;

    await contact.save();

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: { contact }
    });

  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete a contact (soft delete)
// @access  Private
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const contact = await Contact.findOneAndUpdate(
      { _id: id, userId: user._id },
      { isActive: false },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });

  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/contacts/upload
// @desc    Upload contacts from Excel/CSV file
// @access  Private
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Parse the uploaded file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File is empty or invalid format'
      });
    }

    const contacts = [];
    const errors = [];
    let successCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any;
      
      try {
        // Extract data from row (handle different column names)
        const name = row.Name || row.name || row.NAME || row['Contact Name'] || '';
        const phone = row.Phone || row.phone || row.PHONE || row['Phone Number'] || row.Number || '';
        const email = row.Email || row.email || row.EMAIL || '';

        if (!name || !phone) {
          errors.push({
            row: i + 1,
            error: 'Name and phone number are required'
          });
          continue;
        }

        // Clean phone number
        const cleanPhone = phone.toString().replace(/\D/g, '');
        
        if (cleanPhone.length < 10) {
          errors.push({
            row: i + 1,
            error: 'Invalid phone number format'
          });
          continue;
        }

        // Check if contact already exists
        const existingContact = await Contact.findOne({ 
          userId: user._id, 
          phone: cleanPhone 
        });

        if (existingContact) {
          errors.push({
            row: i + 1,
            error: 'Contact already exists'
          });
          continue;
        }

        const contact = new Contact({
          userId: user._id,
          name: name.toString().trim(),
          phone: cleanPhone,
          email: email ? email.toString().trim() : undefined
        });

        await contact.save();
        contacts.push(contact);
        successCount++;

      } catch (error) {
        errors.push({
          row: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      message: `Upload completed. ${successCount} contacts added successfully.`,
      data: {
        totalProcessed: data.length,
        successCount,
        errorCount: errors.length,
        contacts: contacts.slice(0, 10), // Return first 10 for preview
        errors: errors.slice(0, 10) // Return first 10 errors
      }
    });

  } catch (error) {
    console.error('Upload contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during file upload'
    });
  }
});


export default router;
