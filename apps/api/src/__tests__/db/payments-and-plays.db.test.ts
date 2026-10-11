/**
 * Real-database tests for the money path and the play-counting rule.
 * Runs only when TEST_DATABASE_URL points at a migrated Postgres database:
 *   TEST_DATABASE_URL=postgresql://.../thequeue_test npx vitest run src/__tests__/db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { WebhooksService } from "../../payments/webhooks.service";
import { QueueOrderingService } from "../../live-sessions/queue-ordering/queue-ordering.service";
import { HostEarningsService } from "../../host/host-earnings.service";
import { recordQualifyingPlay } from "../../live-sessions/play-counting";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("payments, earnings and play counting (real Postgres)", () => {
  let prisma: PrismaClient;
  let webhooks: WebhooksService;
  let earnings: HostEarningsService;
  const ids = {
    artist: generateUuidV7(),
    hostUser: generateUuidV7(),
    hostProfile: generateUuidV7(),
    station: generateUuidV7(),
    session: generateUuidV7(),
    track: generateUuidV7(),
  };

  async function makePaidSubmission(priceCents: number) {
    const submissionId = generateUuidV7();
    const paymentIntentId = `pi_test_${submissionId.slice(-12)}`;
    await prisma.submission.create({
      data: {
        id: submissionId,
        submittingUserId: ids.artist,
        sourceTrackId: ids.track,
        liveSessionId: ids.session,
        isPriority: true,
        currentQueueStatus: "AWAITING_PAYMENT",
        trackSnapshot: {
          create: {
            id: generateUuidV7(),
            artistName: "Emerald",
            songName: "Night Drive",
            explicitContent: false,
            sourceType: "UPLOADED_AUDIO",
            playbackCapability: "NATIVE_AUDIO",
            durationSeconds: 180,
          },
        },
        queueEntry: {
          create: { id: generateUuidV7(), liveSessionId: ids.session, status: "AWAITING_PAYMENT", priorityRank: 2 },
        },
      },
    });
    const platform = Math.round(priceCents * 0.15);
    await prisma.payment.create({
      data: {
        id: generateUuidV7(),
        providerPaymentId: paymentIntentId,
        payingUserId: ids.artist,
        hostUserId: ids.hostUser,
        submissionId,
        grossAmountCents: priceCents,
        hostAllocationCents: priceCents - platform,
        platformAllocationCents: platform,
        status: "CREATED",
      },
    });
    return { submissionId, paymentIntentId };
  }

  function succeededEvent(paymentIntentId: string) {
    return {
      id: `evt_${generateUuidV7()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: paymentIntentId, metadata: {}, transfer_data: { destination: "acct_test" } } },
    } as any;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ connectionString: url });
    webhooks = new WebhooksService(prisma, new QueueOrderingService(), { get: () => null } as any);
    earnings = new HostEarningsService(prisma);

    for (const [code, category] of [
      ["PAYMENT_CLEARING", "ASSET"],
      ["HOST_PAYABLE", "LIABILITY"],
      ["PLATFORM_COMMISSION", "REVENUE"],
    ]) {
      await prisma.ledgerAccount.upsert({
        where: { code },
        create: { id: generateUuidV7(), code, name: code, category },
        update: {},
      });
    }
    const user = (id: string, name: string) => ({
      id,
      email: `${name}-${id}@test.local`,
      normalizedEmail: `${name}-${id}@test.local`,
      username: `${name}-${id.slice(-8)}`,
      normalizedUsername: `${name}-${id.slice(-8)}`,
      displayName: name,
      passwordHash: "x",
      accountStatus: "ACTIVE" as const,
    });
    await prisma.user.create({ data: user(ids.artist, "artist") });
    await prisma.user.create({ data: user(ids.hostUser, "host") });
    await prisma.hostProfile.create({
      data: {
        id: ids.hostProfile,
        userId: ids.hostUser,
        publicHostName: "Test Host",
        normalizedHostName: "test host",
        country: "CA",
        hostSlug: `host-${ids.hostProfile.slice(-8)}`,
        normalizedHostSlug: `host-${ids.hostProfile.slice(-8)}`,
      },
    });
    await prisma.station.create({
      data: {
        id: ids.station,
        hostId: ids.hostProfile,
        stationName: "Test Station",
        normalizedStationName: "test station",
        slug: `station-${ids.station.slice(-8)}`,
      },
    });
    await prisma.liveSession.create({
      data: {
        id: ids.session,
        stationId: ids.station,
        hostId: ids.hostUser,
        status: "LIVE",
        liveTitle: "Test Broadcast",
        startedAt: new Date(),
        primaryStreamingPlatform: "TIKTOK",
        savedProfileUrlSnapshot: "https://tiktok.com/@host",
      },
    });
    await prisma.track.create({
      data: {
        id: ids.track,
        userId: ids.artist,
        songName: "Night Drive",
        normalizedSongName: "night drive",
        sourceType: "UPLOADED_AUDIO",
        playbackCapability: "NATIVE_AUDIO",
        processingState: "READY",
        durationSeconds: 180,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("confirming a payment posts a balanced ledger entry, queues the track and records the host's earning", async () => {
    const { submissionId, paymentIntentId } = await makePaidSubmission(1500);
    await webhooks.processEvent(succeededEvent(paymentIntentId), "{}");

    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerPaymentId: paymentIntentId } });
    expect(payment.status).toBe("SETTLED");

    const tx = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { idempotencyKey: `webhook_${paymentIntentId}_capture` },
      include: { entries: true },
    });
    expect(tx.isPosted).toBe(true);
    expect(tx.entries.reduce((s, e) => s + e.amountCents, 0)).toBe(0);

    const entry = await prisma.queueEntry.findUniqueOrThrow({ where: { submissionId } });
    expect(entry.status).toBe("QUEUED");

    const earning = await prisma.hostEarning.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(earning).toMatchObject({ hostId: ids.hostProfile, liveSessionId: ids.session, hostShareCents: 1275 });
  });

  it("is idempotent when Stripe redelivers the same event", async () => {
    const { paymentIntentId } = await makePaidSubmission(500);
    const event = succeededEvent(paymentIntentId);
    await webhooks.processEvent(event, "{}");
    await webhooks.processEvent(event, "{}");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerPaymentId: paymentIntentId } });
    expect(await prisma.hostEarning.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it("income summary groups by broadcast and year, and subtracts refunds", async () => {
    const live = await earnings.forLive(ids.hostProfile, ids.session);
    expect(live).toMatchObject({ grossCents: 2000, netHostCents: 1275 + 425, paidSubmissions: 2 });

    // Refund the $5 payment in full
    const refunded = await prisma.payment.findFirstOrThrow({ where: { grossAmountCents: 500 } });
    await webhooks.processEvent(
      {
        id: `evt_${generateUuidV7()}`,
        type: "charge.refunded",
        data: {
          object: {
            payment_intent: refunded.providerPaymentId,
            amount_refunded: 500,
            refunds: { data: [{ id: `re_${generateUuidV7().slice(-12)}`, amount: 500, status: "succeeded", reason: null, created: Math.floor(Date.now() / 1000) }] },
          },
        },
      } as any,
      "{}",
    );

    const summary = await earnings.summary(ids.hostProfile, "America/Halifax");
    expect(summary.total.netHostCents).toBe(1275);
    expect(summary.total.refundedHostCents).toBe(425);
    expect(summary.yearly[0]).toMatchObject({ year: new Date().getFullYear(), netHostCents: 1275 });
    expect(summary.perLive.find((l) => l.liveSessionId === ids.session)?.netHostCents).toBe(1275);
  });

  it("counts a track once per host per 4 hours, however many times it is played", async () => {
    const entryIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { submissionId } = await makePaidSubmission(500);
      entryIds.push((await prisma.queueEntry.findUniqueOrThrow({ where: { submissionId } })).id);
    }
    const t0 = new Date("2026-03-08T10:00:00Z");
    const play = (i: number, at: Date) =>
      prisma.$transaction((tx) =>
        recordQualifyingPlay(tx, { queueEntryId: entryIds[i], liveSessionId: ids.session, hostUserId: ids.hostUser, now: at }),
      );

    expect((await play(0, t0)).counted).toBe(true); // first play counts
    expect((await play(1, new Date(t0.getTime() + 3 * 3600_000))).counted).toBe(false); // 3h later: replay, not counted
    expect((await play(2, new Date(t0.getTime() + 4 * 3600_000))).counted).toBe(true); // 4h later: counts again

    const events = await prisma.playbackEvent.findMany({ where: { queueEntryId: { in: entryIds } } });
    expect(events.map((e) => e.eventType).sort()).toEqual([
      "QUALIFIED_PLAY",
      "QUALIFIED_PLAY",
      "QUALIFIED_PLAY_NOT_COUNTED",
    ]);
  });
});
