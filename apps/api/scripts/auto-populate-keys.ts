import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const applications = await prisma.application.findMany();
  console.log(`Found ${applications.length} applications in database.`);

  for (const app of applications) {
    let { apiKey, publicKey, privateKey, webhookSecret } = app;
    let updated = false;

    if (!apiKey) {
      apiKey = `cc_live_${crypto.randomBytes(24).toString('hex')}`;
      updated = true;
    }
    if (!webhookSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex');
      updated = true;
    }
    if (!publicKey || !privateKey) {
      const keys = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      updated = true;
    }

    if (updated) {
      await prisma.application.update({
        where: { id: app.id },
        data: { apiKey, publicKey, privateKey, webhookSecret }
      });
      console.log(`Updated credentials for application: ${app.displayName} (${app.id})`);
    } else {
      console.log(`Application already had full credentials: ${app.displayName} (${app.id})`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Error auto-populating keys:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
