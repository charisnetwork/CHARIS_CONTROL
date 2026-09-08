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
  let decodedUser: jwt.JwtPayload | string;
  try {
    decodedUser = jwt.verify(token, jwtSecret());
  } catch (_) {
    throw new AppError('Unauthorized: Invalid or expired token. Please log in again.', 401);
  }

  if (typeof decodedUser === 'string' || !decodedUser.id || !decodedUser.email || !decodedUser.role) {
    throw new AppError('Unauthorized: Invalid token payload.', 401);
  }

  const role = String(decodedUser.role) as AdminRole;
  if (!Object.values(AdminRole).includes(role)) {
    throw new AppError('Unauthorized: Invalid token role.', 401);
  }

  req.user = {
    id: String(decodedUser.id),
    email: String(decodedUser.email),
    role
  };

  next();
};

export const MANAGEMENT_ROLES: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ADMIN];

export const requireRoles = (roles: (AdminRole | string)[]) => {
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
