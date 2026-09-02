import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config';
import { prisma } from '../lib/prisma';


export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid credentials or account suspended' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Update last login
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  // Create Audit Log
  await prisma.auditLog.create({
    data: {
      adminId: user.id,
      action: 'LOGIN',
      module: 'Auth',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    }
  });

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName
  };

  const token = jwt.sign(payload, jwtSecret(), { expiresIn: '1h' });

  res.json({
    message: 'Login successful',
    token,
    user: payload
  });
};
