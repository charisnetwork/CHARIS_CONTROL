import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'pachu@gmail.com';
  const password = 'nishu@143';
  
  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
    create: {
      email,
      password: hashedPassword,
      firstName: 'Pachu',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });

  console.log('Seeded admin user:', admin.email);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
