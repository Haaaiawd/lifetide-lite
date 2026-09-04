const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const codes = await prisma.inviteCode.findMany({ orderBy: { createdAt: 'desc' } });
  console.log('Total invite codes:', codes.length);
  codes.forEach(c => console.log(c.code, 'used:', c.usedCount, 'max:', c.maxUses, 'exhausted:', c.exhausted));
  await prisma.$disconnect();
})();
