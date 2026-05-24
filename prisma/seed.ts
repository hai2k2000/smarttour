import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = ['Hotel', 'Restaurant', 'Vehicle', 'Tour Guide', 'Flight Ticket', 'Attraction Ticket', 'Landtour', 'Other Cost'];
  for (const name of categories) {
    await prisma.supplierCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.user.upsert({
    where: { email: 'admin@smarttour.local' },
    update: {},
    create: {
      email: 'admin@smarttour.local',
      name: 'SmartTour Admin',
      passwordHash: 'CHANGE_ME_HASH',
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
