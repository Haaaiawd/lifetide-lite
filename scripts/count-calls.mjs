import { PrismaClient } from "@prisma/client";

process.loadEnvFile(".env");

const prisma = new PrismaClient();

const rows = await prisma.modelCallLog.findMany({
  orderBy: { createdAt: "asc" },
});

for (const r of rows) {
  console.log(`${r.purpose} | ${r.status} | ${r.model_config_id} | wave=${r.wave_id}`);
}

console.log(`total: ${rows.length}`);
await prisma.$disconnect();
