/**
 * Seed script: creates an admin user and an initial invite code.
 *
 * Usage inside Docker container:
 *   docker compose cp scripts/seed-admin.cjs lifetide:/app/seed-admin.cjs
 *   docker compose exec lifetide node /app/seed-admin.cjs
 *
 * Or locally:
 *   pnpm tsx scripts/seed-admin.cjs
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@lifetide.ai';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

(async () => {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const u = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: hash },
    create: { email: ADMIN_EMAIL, passwordHash: hash },
  });
  console.log('Admin user ready:', u.email);

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  await prisma.inviteCode.create({
    data: { code, maxUses: 50, note: 'initial', exhausted: false },
  });
  console.log('Invite code:', code);
  console.log('Password:', ADMIN_PASSWORD);

  await prisma.$disconnect();
})();
