/**
 * Production-safe bootstrap. Idempotent: run on every deploy.
 * - Creates reference data (genres, ledger accounts, legal docs) if missing.
 * - Creates platform settings rows only if missing; never overwrites values an
 *   admin has since changed (fee split, payment emergency state, etc).
 * - Creates the first Owner Admin from ADMIN_BOOTSTRAP_* env vars, once.
 */
import {
  PrismaClient,
  AccountStatus,
  StripePlatformMode,
  PaymentEmergencyState,
} from "../src/index";
import * as crypto from "crypto";

for (const file of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* not present */
  }
}
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log(
    "🌱 Starting TheQueue database seeding with Admin & Stripe Platforms...",
  );

  // ==========================================================================
  // 1. Seed Enabled Streaming Platforms
  // ==========================================================================
  console.log(
    "👉 Streaming platforms validated via enum (KICK, YOUTUBE, TIKTOK, FACEBOOK, TWITCH)",
  );

  // ==========================================================================
  // 2. Seed Default Genres
  // ==========================================================================
  const defaultGenres = [
    { name: "Electronic", slug: "electronic" },
    { name: "Hip Hop", slug: "hip-hop" },
    { name: "Pop", slug: "pop" },
    { name: "Rock", slug: "rock" },
    { name: "Lo-Fi", slug: "lo-fi" },
    { name: "Synthwave", slug: "synthwave" },
    { name: "R&B", slug: "r-and-b" },
    { name: "Metal", slug: "metal" },
  ];

  console.log("👉 Seeding default music genres...");
  for (const genre of defaultGenres) {
    await prisma.genre.upsert({
      where: { name: genre.name },
      update: {},
      create: {
        id: crypto.randomUUID(),
        name: genre.name,
        normalizedName: genre.slug,
      },
    });
  }

  // ==========================================================================
  // 3. Seed Default Overlay Themes
  // ==========================================================================
  const defaultThemes = [
    {
      name: "Cyberpunk Neon",
      cssVariables: JSON.stringify({
        "--color-bg": "#09090b",
        "--color-primary": "#f43f5e",
        "--color-secondary": "#06b6d4",
        "--color-text": "#fafafa",
        "--font-family": "monospace",
      }),
      isPublic: true,
    },
    {
      name: "Deep Midnight",
      cssVariables: JSON.stringify({
        "--color-bg": "#020617",
        "--color-primary": "#8b5cf6",
        "--color-secondary": "#6366f1",
        "--color-text": "#f8fafc",
        "--font-family": "sans-serif",
      }),
      isPublic: true,
    },
  ];

  console.log("👉 Seeding default overlay themes...");
  for (const theme of defaultThemes) {
    await prisma.overlayTheme.upsert({
      where: { name: theme.name },
      update: { cssVariables: theme.cssVariables, isPublic: theme.isPublic },
      create: {
        id: crypto.randomUUID(),
        name: theme.name,
        cssVariables: theme.cssVariables,
        isPublic: theme.isPublic,
      },
    });
  }

  // ==========================================================================
  // 4. Seed Default Platform Fee Rule (85% Host / 15% TheQueue Split)
  // ==========================================================================
  console.log("👉 Seeding default platform fee rule (85/15 Connect split)...");
  await prisma.platformFeeRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      ruleName: "TheQueue Default 85/15 split",
      hostPercentage: 85.0,
      platformPercentage: 15.0,
      isActive: true,
    },
  });

  // ==========================================================================
  // 5. Seed Platform General Configuration
  // ==========================================================================
  console.log("👉 Seeding default platform global configuration...");
  const defaultConfigId = "00000000-0000-0000-0000-000000000002";
  await prisma.platformConfiguration.upsert({
    where: { id: defaultConfigId },
    update: {},
    create: {
      id: defaultConfigId,
      isActive: true,
      minimumPriorityPrice: 200,
      maximumPriorityPrice: 50000,
      supportedCurrencies: JSON.stringify(["USD"]),
      enabledPayoutProviders: JSON.stringify(["STRIPE"]),
      globalPayoutDelayDays: 7,
      globalRefundWindowDays: 3,
      globalUploadLimitMb: 50,
      maxTrackDurationSeconds: 600,
      featureFlags: JSON.stringify({
        hostApplicationsEnabled: true,
        priorityTiersEnabled: true,
        userUploadsEnabled: true,
      }),
    },
  });

  // ==========================================================================
  // 6. Seed Default Legal Documents
  // ==========================================================================
  const legalDocs = [
    { slug: "terms", title: "Terms of Service" },
    { slug: "privacy", title: "Privacy Policy" },
    { slug: "community-guidelines", title: "Community Guidelines" },
    { slug: "host-agreement", title: "Stream Host Broadcaster Agreement" },
    {
      slug: "payment-priority-policy",
      title: "Payment and Priority Submission Policy",
    },
  ];

  console.log("👉 Seeding legal documents & initial versions...");
  for (const doc of legalDocs) {
    const documentRecord = await prisma.legalDocument.upsert({
      where: { slug: doc.slug },
      update: { title: doc.title },
      create: {
        id: crypto.randomUUID(),
        slug: doc.slug,
        title: doc.title,
      },
    });

    const defaultVersionString = "2026-08-01.1";
    await prisma.legalDocumentVersion.upsert({
      where: {
        documentId_versionString: {
          documentId: documentRecord.id,
          versionString: defaultVersionString,
        },
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        documentId: documentRecord.id,
        versionString: defaultVersionString,
        content: `This represents the initial baseline ${doc.title} of TheQueue. Created for production-readiness on 2026-08-03. All rights reserved.`,
      },
    });
  }

  // ==========================================================================
  // 7. Seed Balanced Double-Entry Core Ledger Accounts
  // ==========================================================================
  const defaultAccounts = [
    {
      code: "PAYMENT_CLEARING",
      name: "Customer Stripe Payment Clearing Account",
      category: "ASSET",
    },
    {
      code: "HOST_PAYABLE",
      name: "Stripe Connect Host Payable Allocation Liability Account",
      category: "LIABILITY",
    },
    {
      code: "PLATFORM_COMMISSION",
      name: "TheQueue Gross Application Commission Revenue Account",
      category: "REVENUE",
    },
    {
      code: "PROCESSOR_EXPENSE",
      name: "Stripe Processing and Connected Fees Expense Account",
      category: "EXPENSE",
    },
    {
      code: "REFUND_LIABILITY",
      name: "Customer Refund Liability Reserve Account",
      category: "LIABILITY",
    },
    {
      code: "DISPUTE_RESERVE",
      name: "Stripe Dispute Reserve Holding Account",
      category: "LIABILITY",
    },
    { code: "TAX_PAYABLE", name: "Tax Payable Account", category: "LIABILITY" },
    {
      code: "PAYOUT_CLEARING",
      name: "Host External Bank Payout Clearing Account",
      category: "ASSET",
    },
  ];

  console.log("👉 Seeding double-entry ledger accounts (USD native)...");
  for (const account of defaultAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        category: account.category,
        isActive: true,
      },
      create: {
        id: crypto.randomUUID(),
        code: account.code,
        name: account.name,
        category: account.category,
        currency: "USD",
        isActive: true,
      },
    });
  }

  // ==========================================================================
  // 8. Seed Stripe Platform Configuration (Non-secret Metadata)
  // ==========================================================================
  console.log("👉 Ensuring Stripe platform configuration record...");
  const defaultStripeConfigId = "00000000-0000-0000-0000-000000000003";
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  await prisma.stripePlatformConfiguration.upsert({
    where: { id: defaultStripeConfigId },
    // Admin-managed after first deploy; only refresh the mode from the key in use
    update: {
      stripePlatformMode: stripeKey.startsWith("sk_live_")
        ? StripePlatformMode.LIVE
        : StripePlatformMode.TEST,
      stripePlatformConnected: stripeKey.length > 0,
    },
    create: {
      id: defaultStripeConfigId,
      stripePlatformAccountId: process.env.STRIPE_PLATFORM_ACCOUNT_ID || "acct_unconfigured",
      stripePlatformDisplayName: process.env.LEGAL_ENTITY_NAME || "TheQueue",
      stripePlatformCountry: process.env.STRIPE_PLATFORM_COUNTRY || "US",
      stripePlatformDefaultCurrency: "USD",
      stripePlatformConnected: stripeKey.length > 0,
      stripePlatformMode: stripeKey.startsWith("sk_live_")
        ? StripePlatformMode.LIVE
        : StripePlatformMode.TEST,
      isPaymentsEnabled: true,
    },
  });

  // ==========================================================================
  // 9. Seed Payment Emergency Default State
  // ==========================================================================
  console.log("👉 Seeding default payment emergency state...");
  const defaultEmergencyControlId = "00000000-0000-0000-0000-000000000004";
  await prisma.paymentEmergencyControl.upsert({
    where: { id: defaultEmergencyControlId },
    update: {},
    create: {
      id: defaultEmergencyControlId,
      state: PaymentEmergencyState.PAYMENTS_ENABLED,
      reason: "Platform initialization: Payments activated.",
      changedByUserId: "00000000-0000-0000-0000-000000000000",
      previousState: PaymentEmergencyState.PAYMENTS_ENABLED,
    },
  });

  // ==========================================================================
  // 10. Bootstrap the first Owner Administrator (environment-driven, once)
  // ==========================================================================
  console.log("👉 Checking for Owner Administrator credentials...");
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const adminUsername = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (adminPassword && adminPassword.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.");
  }

  if (adminEmail && adminUsername && adminPassword) {
    console.log(
      `👤 Seeding Owner Administrator: ${adminUsername} (${adminEmail})...`,
    );

    const hashedPassword = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const adminId = crypto.randomUUID();
    const normalizedEmail = adminEmail.toLowerCase().trim();
    const normalizedUsername = adminUsername.toLowerCase().trim();

    // Existing account keeps its current password; the env password is only
    // used when the account is first created.
    const adminUser = await prisma.user.upsert({
      where: { normalizedEmail },
      update: {
        isAdmin: true,
      },
      create: {
        id: adminId,
        email: adminEmail,
        normalizedEmail,
        username: adminUsername,
        normalizedUsername,
        displayName: "Platform Owner Administrator",
        passwordHash: hashedPassword,
        isHost: false,
        isAdmin: true,
        accountStatus: AccountStatus.ACTIVE,
        emailVerified: true,
      },
    });

    // Seed Owner Admin permissions
    const ownerPermissions = [
      "ADMIN_PLATFORM_FULL",
      "ADMIN_MODERATOR_MANAGE",
      "ADMIN_ROLE_MANAGE",
      "STRIPE_PLATFORM_CONFIGURE",
      "STRIPE_PLATFORM_VIEW_STATUS",
      "PAYMENT_CONFIGURATION_MANAGE",
      "PLATFORM_COMMISSION_MANAGE",
      "HOST_APPLICATION_MANAGE",
      "USER_BAN_MANAGE",
      "CONTENT_MODERATE",
      "PAYMENT_RECORD_VIEW",
      "REFUND_MANAGE",
      "DISPUTE_REVIEW",
      "AUDIT_LOG_VIEW",
      "PLATFORM_SETTINGS_MANAGE",
    ];

    await prisma.userRoleAssignment.upsert({
      where: {
        userId_role: {
          userId: adminUser.id,
          role: "OWNER_ADMIN",
        },
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        userId: adminUser.id,
        role: "OWNER_ADMIN",
      },
    });

    for (const permission of ownerPermissions) {
      await prisma.userPermissionAssignment.upsert({
        where: {
          userId_permission: {
            userId: adminUser.id,
            permission,
          },
        },
        update: {},
        create: {
          id: crypto.randomUUID(),
          userId: adminUser.id,
          permission,
        },
      });
    }

    console.log(
      "✅ Local development administrator seeded successfully with OWNER_ADMIN role!",
    );
  } else {
    console.log(
      "⚠️  Skipping Owner Administrator seeding: ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_USERNAME, or ADMIN_BOOTSTRAP_PASSWORD was not supplied.",
    );
  }

  console.log("🌲 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
