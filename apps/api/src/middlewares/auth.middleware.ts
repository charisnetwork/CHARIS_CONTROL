import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import { AdminRole } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: AdminRole;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Unauthorized: Missing or invalid token', 401);
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError('Internal Server Error: JWT_SECRET is not configured', 500);
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      id: string;
      email: string;
      role: AdminRole;
    };
    req.user = decoded;
    next();
  } catch (error) {
    throw new AppError('Unauthorized: Invalid token', 401);
  }
};

export const requireRoles = (roles: AdminRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Unauthorized: User not authenticated', 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError('Forbidden: Insufficient permissions', 403);
    }
    next();
  };
};
