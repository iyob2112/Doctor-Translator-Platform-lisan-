import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function upsertCatalog() {
  const plans = [
    {
      slug: "monthly-3-devices",
      name: "Monthly — 3 Devices",
      description: "Up to 3 hospital devices. Unlimited live consults while the plan is active.",
      priceEtb: 2000,
      maxDevices: 3,
      intervalDays: 30,
      sortOrder: 1,
    },
    {
      slug: "monthly-5-devices",
      name: "Monthly — 5 Devices",
      description: "Up to 5 hospital devices. Unlimited live consults while the plan is active.",
      priceEtb: 2500,
      maxDevices: 5,
      intervalDays: 30,
      sortOrder: 2,
    },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }

  const packages = [
    { slug: "minutes-500", name: "500 Minutes", minutes: 500, priceEtb: 300, sortOrder: 1 },
    { slug: "minutes-1000", name: "1,000 Minutes", minutes: 1000, priceEtb: 500, sortOrder: 2 },
    { slug: "minutes-5000", name: "5,000 Minutes", minutes: 5000, priceEtb: 2000, sortOrder: 3 },
  ];
  for (const pkg of packages) {
    await prisma.minutePackage.upsert({
      where: { slug: pkg.slug },
      update: pkg,
      create: pkg,
    });
  }

  const services = [
    {
      slug: "video-interpretation",
      name: "Video interpretation",
      description: "Scheduled live video interpreter.",
      callMode: "video",
      pricePerHourEtb: 400,
      sortOrder: 1,
    },
    {
      slug: "voice-interpretation",
      name: "Voice interpretation",
      description: "Scheduled live voice interpreter.",
      callMode: "voice",
      pricePerHourEtb: 300,
      sortOrder: 2,
    },
  ];
  for (const service of services) {
    await prisma.bookingService.upsert({
      where: { slug: service.slug },
      update: service,
      create: service,
    });
  }

  const existingSlots = await prisma.bookingSlot.findMany();
  const have = new Set(existingSlots.map((s) => `${s.weekday}:${s.startMinute}:${s.endMinute}`));
  const weekdaySlots = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 8 * 60,
    endMinute: 18 * 60,
    isActive: true,
  }));
  weekdaySlots.push({ weekday: 6, startMinute: 9 * 60, endMinute: 13 * 60, isActive: true });
  await prisma.bookingSlot.createMany({
    data: weekdaySlots.filter((slot) => !have.has(`${slot.weekday}:${slot.startMinute}:${slot.endMinute}`)),
  });

  await prisma.platformBillingConfig.upsert({
    where: { id: "default" },
    update: { rateEtb: 400, rateUnit: "hour", enabled: true },
    create: { id: "default", rateEtb: 400, rateUnit: "hour", enabled: true },
  });
}

async function main() {
  await prisma.minuteTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.usageLine.deleteMany();
  await prisma.usageInvoice.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.device.deleteMany();
  await prisma.minuteBalance.deleteMany();
  await prisma.translatorRequest.deleteMany();
  await prisma.sessionTransfer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.translatorLanguage.deleteMany();
  await prisma.translatorProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.language.deleteMany();

  const languages = await Promise.all(
    [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
      { code: "am", name: "Amharic" },
      { code: "fr", name: "French" },
      { code: "ar", name: "Arabic" },
      { code: "zh", name: "Mandarin" },
      { code: "so", name: "Somali" },
    ].map((lang) => prisma.language.create({ data: lang }))
  );

  const byCode = Object.fromEntries(languages.map((l) => [l.code, l]));

  const hospital = await prisma.organization.create({
    data: {
      name: "City General Hospital",
      address: "1200 Medical Plaza, Suite 400",
      departments: {
        create: [
          { name: "Emergency" },
          { name: "Pediatrics" },
          { name: "Internal Medicine" },
        ],
      },
    },
    include: { departments: true },
  });

  const internal = hospital.departments.find((d) => d.name === "Internal Medicine");

  const hash = (password) => bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@demo.com",
      passwordHash: await hash("Admin123!"),
      fullName: "Maya Chen",
      role: "admin",
    },
  });

  const hospitalAdmin = await prisma.user.create({
    data: {
      email: "hospital@demo.com",
      passwordHash: await hash("Hospital123!"),
      fullName: "Abel Tesfaye",
      role: "hospital_admin",
      organizationId: hospital.id,
    },
  });

  const translator1 = await prisma.user.create({
    data: {
      email: "translator@demo.com",
      passwordHash: await hash("Translator123!"),
      fullName: "Sofia Ramirez",
      role: "translator",
      organizationId: hospital.id,
      departmentId: internal.id,
      translatorProfile: { create: { isOnline: false, approvalStatus: "approved" } },
    },
    include: { translatorProfile: true },
  });

  const translator2 = await prisma.user.create({
    data: {
      email: "translator2@demo.com",
      passwordHash: await hash("Translator123!"),
      fullName: "Dawit Bekele",
      role: "translator",
      organizationId: hospital.id,
      translatorProfile: { create: { isOnline: false, approvalStatus: "approved" } },
    },
    include: { translatorProfile: true },
  });

  const translator3 = await prisma.user.create({
    data: {
      email: "translator3@demo.com",
      passwordHash: await hash("Translator123!"),
      fullName: "Amira Haddad",
      role: "translator",
      organizationId: hospital.id,
      translatorProfile: { create: { isOnline: false, approvalStatus: "approved" } },
    },
    include: { translatorProfile: true },
  });

  await upsertCatalog();

  const monthlyFive = await prisma.plan.findUnique({ where: { slug: "monthly-5-devices" } });
  if (monthlyFive) {
    const startsAt = new Date();
    await prisma.subscription.create({
      data: {
        organizationId: hospital.id,
        planId: monthlyFive.id,
        createdById: hospitalAdmin.id,
        status: "active",
        startsAt,
        expiresAt: new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        autoRenew: true,
      },
    });
  }

  await prisma.translatorLanguage.createMany({
    data: [
      { translatorId: translator1.translatorProfile.id, languageId: byCode.es.id },
      { translatorId: translator1.translatorProfile.id, languageId: byCode.en.id },
      { translatorId: translator1.translatorProfile.id, languageId: byCode.fr.id },
      { translatorId: translator2.translatorProfile.id, languageId: byCode.am.id },
      { translatorId: translator2.translatorProfile.id, languageId: byCode.en.id },
      { translatorId: translator2.translatorProfile.id, languageId: byCode.so.id },
      { translatorId: translator3.translatorProfile.id, languageId: byCode.ar.id },
      { translatorId: translator3.translatorProfile.id, languageId: byCode.fr.id },
      { translatorId: translator3.translatorProfile.id, languageId: byCode.en.id },
    ],
  });

  console.log("Seeded demo accounts:");
  console.log("  Platform admin  admin@demo.com / Admin123!");
  console.log("  Hospital        hospital@demo.com / Hospital123!");
  console.log("  Translator      translator@demo.com / Translator123!  (approved · Spanish, English, French)");
  console.log(`  Org: ${hospital.name}  Platform: ${admin.fullName}  Hospital: ${hospitalAdmin.fullName}`);
  console.log("  Billing catalog: monthly 3/5 devices, 500/1000/5000 minute packages, on-demand video/voice");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
