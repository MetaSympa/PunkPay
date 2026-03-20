import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Do not run seed in production!');
    process.exit(1);
  }
  console.log('Seeding database (DEV ONLY)...');

  // Create admin user
  const adminPassword = await argon2.hash('Admin@PunkPay2024!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@punkpay.local' },
    update: {},
    create: {
      email: 'admin@punkpay.local',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log(`Admin user: ${admin.email} (${admin.id})`);

  // Create payer user
  const payerPassword = await argon2.hash('Payer@PunkPay2024!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const payer = await prisma.user.upsert({
    where: { email: 'payer@punkpay.local' },
    update: {},
    create: {
      email: 'payer@punkpay.local',
      passwordHash: payerPassword,
      role: 'PAYER',
    },
  });
  console.log(`Payer user: ${payer.email} (${payer.id})`);

  // Create recipient user
  const recipientPassword = await argon2.hash('Recipient@PunkPay2024!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const recipient = await prisma.user.upsert({
    where: { email: 'recipient@punkpay.local' },
    update: {},
    create: {
      email: 'recipient@punkpay.local',
      passwordHash: recipientPassword,
      role: 'RECIPIENT',
    },
  });
  console.log(`Recipient user: ${recipient.email} (${recipient.id})`);

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
