import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import { AdminRole } from '@prisma/client';
import { jwtSecret } from '../config';

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
  try {
    const decoded = jwt.verify(token, jwtSecret()) as {
      id: string;
      email: string;
      role: AdminRole;
    };
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof Error && error.message === 'JWT_SECRET must be configured') {
      throw new AppError('Authentication is not configured', 503);
    }
    throw new AppError('Unauthorized: Invalid token', 401);
  }
};

export const MANAGEMENT_ROLES: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ADMIN];

export const requireRoles = (roles: (AdminRole | string)[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Unauthorized: User not authenticated', 401);
    }
    const userRole = String(req.user.role || '').toUpperCase().replace(/_/g, '');
    const allowedRoles = roles.map(r => String(r).toUpperCase().replace(/_/g, ''));
    
    const isAllowed = allowedRoles.includes(userRole) || 
                      userRole === 'SUPERADMIN' || 
                      userRole === 'ADMIN' ||
                      userRole.includes('ADMIN');

    if (!isAllowed) {
      throw new AppError('Forbidden: Insufficient permissions', 403);
    }
    next();
  };
};
