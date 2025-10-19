import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import redis from '../config/redis';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    // Check cache first for better performance
    const cacheKey = `user:${decoded.userId}`;
    let cachedUser = await redis.get(cacheKey);
    
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
    } else {
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        res.status(401).json({ 
          success: false, 
          message: 'Invalid token. User not found.' 
        });
        return;
      }
      
      // Cache user for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(user));
      req.user = user;
    }

    if (!req.user?.isActive) {
      res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated.' 
      });
      return;
    }
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid token.' 
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ 
        success: false, 
        message: 'Token expired.' 
      });
      return;
    }

    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during authentication.' 
    });
  }
};

export const generateToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRE || '7d' } as any
  );
};
