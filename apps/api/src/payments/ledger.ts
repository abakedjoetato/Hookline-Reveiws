import { generateUuidV7 } from "@platform/database";

export interface LedgerLine {
  /** LedgerAccount.code, e.g. PAYMENT_CLEARING */
  account: string;
  /** Positive = debit, negative = credit. Lines must sum to zero. */
  amountCents: number;
}

/**
 * Posts a balanced double-entry transaction inside an open Prisma transaction.
 * Idempotent on `idempotencyKey` (returns false if it was already posted).
 *
 * Order matters: the DB trigger refuses to mark a transaction posted until
 * its entries balance, so it is inserted unposted, entries are added, and
 * only then is it flagged posted.
 */
export async function postLedgerTransaction(
  tx: any,
  params: {
    idempotencyKey: string;
    description: string;
    systemSource: string;
    paymentId?: string;
    refundId?: string;
    disputeId?: string;
    lines: LedgerLine[];
  },
): Promise<boolean> {
  const sum = params.lines.reduce((s, l) => s + l.amountCents, 0);
  if (sum !== 0) {
    throw new Error(`Ledger transaction ${params.idempotencyKey} does not balance (${sum})`);
  }
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) return false;

  const codes = [...new Set(params.lines.map((l) => l.account))];
  const accounts = await tx.ledgerAccount.findMany({ where: { code: { in: codes } } });
  const idByCode = new Map<string, string>(accounts.map((a: any) => [a.code, a.id]));
  for (const code of codes) {
    if (!idByCode.has(code)) {
      throw new Error(`Ledger account ${code} is missing; run the database seed`);
    }
  }

  const transactionId = generateUuidV7();
  await tx.ledgerTransaction.create({
    data: {
      id: transactionId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      systemSource: params.systemSource,
      paymentId: params.paymentId,
      refundId: params.refundId,
      disputeId: params.disputeId,
      isPosted: false,
    },
  });
  await tx.ledgerEntry.createMany({
    data: params.lines
      .filter((l) => l.amountCents !== 0)
      .map((l) => ({
        id: generateUuidV7(),
        transactionId,
        accountId: idByCode.get(l.account)!,
        amountCents: l.amountCents,
      })),
  });
  await tx.ledgerTransaction.update({
    where: { id: transactionId },
    data: { isPosted: true },
  });
  return true;
}
