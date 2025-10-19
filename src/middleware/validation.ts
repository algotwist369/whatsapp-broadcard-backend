import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorMessage = error.details[0].message;
      res.status(400).json({
        success: false,
        message: errorMessage,
        field: error.details[0].path[0]
      });
      return;
    }
    
    next();
  };
};

// Validation schemas
export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 50 characters',
    'any.required': 'Name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  }),
  phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number'
  })
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  })
});

export const contactSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.min': 'Contact name is required',
    'string.max': 'Contact name cannot exceed 100 characters',
    'any.required': 'Contact name is required'
  }),
  phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).required().messages({
    'string.pattern.base': 'Please provide a valid phone number',
    'any.required': 'Phone number is required'
  }),
  email: Joi.string().email().optional().allow('').messages({
    'string.email': 'Please provide a valid email address'
  })
});

export const bulkMessageSchema = Joi.object({
  message: Joi.string().min(1).max(4096).required().messages({
    'string.min': 'Message cannot be empty',
    'string.max': 'Message cannot exceed 4096 characters',
    'any.required': 'Message is required'
  }),
  category: Joi.string().valid('promotional', 'notification', 'advertising', 'discount_offer', 'information', 'other').required().messages({
    'any.only': 'Category must be one of: promotional, notification, advertising, discount_offer, information, other',
    'any.required': 'Category is required'
  }),
  selectedContacts: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).min(1).required().messages({
    'array.min': 'At least one contact must be selected',
    'any.required': 'Selected contacts are required',
    'string.pattern.base': 'Invalid contact ID format'
  })
});
