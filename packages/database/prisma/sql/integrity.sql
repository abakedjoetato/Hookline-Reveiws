-- Hand-written integrity rules that the Prisma schema cannot express.
-- Appended to the baseline migration; keep in sync when regenerating it.

-- ============================================================================
-- CUSTOM DATABASE CONSTRAINTS & ADVANCED INTEGRITY
-- ============================================================================

-- 1. Nonnegative monetary amounts
ALTER TABLE "priority_tiers" ADD CONSTRAINT "check_priority_tiers_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "live_priority_tier_snapshots" ADD CONSTRAINT "check_live_priority_tier_price_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_gross_nonnegative" CHECK ("grossAmountCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_host_alloc_nonnegative" CHECK ("hostAllocationCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_platform_alloc_nonnegative" CHECK ("platformAllocationCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_refunded_nonnegative" CHECK ("refundedAmountCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "check_payments_disputed_nonnegative" CHECK ("disputedAmountCents" >= 0);
ALTER TABLE "payment_attempts" ADD CONSTRAINT "check_payment_attempts_amount_nonnegative" CHECK ("amountCents" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "check_refunds_amount_nonnegative" CHECK ("amountCents" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "check_refunds_host_reversal_nonnegative" CHECK ("hostReversalAmountCents" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "check_refunds_platform_reversal_nonnegative" CHECK ("platformReversalAmountCents" >= 0);
ALTER TABLE "disputes" ADD CONSTRAINT "check_disputes_amount_nonnegative" CHECK ("amountCents" >= 0);
ALTER TABLE "host_earnings" ADD CONSTRAINT "check_host_earnings_gross_nonnegative" CHECK ("grossAmountCents" >= 0);
ALTER TABLE "host_earnings" ADD CONSTRAINT "check_host_earnings_share_nonnegative" CHECK ("hostShareCents" >= 0);
ALTER TABLE "payouts" ADD CONSTRAINT "check_payouts_gross_positive" CHECK ("grossPayoutCents" > 0);

-- 2. Valid percentage ranges
ALTER TABLE "payment_allocations" ADD CONSTRAINT "check_host_percentage_range" CHECK ("hostPercentage" >= 0.00 AND "hostPercentage" <= 100.00);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "check_platform_percentage_range" CHECK ("platformPercentage" >= 0.00 AND "platformPercentage" <= 100.00);
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "check_fee_rule_host_percentage" CHECK ("hostPercentage" >= 0.00 AND "hostPercentage" <= 100.00);
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "check_fee_rule_platform_percentage" CHECK ("platformPercentage" >= 0.00 AND "platformPercentage" <= 100.00);

-- 3. Allocation balances must match exactly
ALTER TABLE "payments" ADD CONSTRAINT "check_allocations_sum_to_gross" CHECK ("hostAllocationCents" + "platformAllocationCents" = "grossAmountCents");
ALTER TABLE "refunds" ADD CONSTRAINT "check_reversals_sum_to_refund" CHECK ("hostReversalAmountCents" + "platformReversalAmountCents" = "amountCents");

-- 4. Expiry/Timestamps logic relations
ALTER TABLE "priority_tier_reservations" ADD CONSTRAINT "check_reservation_expiry_after_created" CHECK ("expiresAt" >= "createdAt");

-- 5. Time-ordering on live sessions
ALTER TABLE "live_sessions" ADD CONSTRAINT "check_live_session_ends_after_starts" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

-- 6. Custom partial unique constraints
CREATE UNIQUE INDEX "unique_default_artist_per_user" ON "artist_identities" ("userId") WHERE "isDefault" = true AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "unique_current_media_version_per_track" ON "track_media_versions" ("trackId") WHERE "isCurrent" = true;

-- 7. Double-entry balanced transaction integrity trigger function
CREATE OR REPLACE FUNCTION verify_ledger_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    entry_sum INT;
BEGIN
    -- Sum amountCents for the current transaction
    SELECT SUM("amountCents") INTO entry_sum
    FROM "ledger_entries"
    WHERE "transactionId" = NEW."id";

    IF NEW."isPosted" = true THEN
        IF entry_sum IS NULL OR entry_sum <> 0 THEN
            RAISE EXCEPTION 'Ledger transaction % cannot be posted because its entries do not balance to zero. Current imbalance: % cents.', NEW."id", COALESCE(entry_sum, 0);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to ledger_transactions table to enforce double-entry constraints
CREATE TRIGGER "ledger_transactions_balance_trigger"
BEFORE INSERT OR UPDATE OF "isPosted" ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION verify_ledger_transaction_balance();


-- ============================================================================
-- SECTION 18: HIGH-SECURITY OWNER ADMIN SAFEGUARDS & FAILSAFES
-- ============================================================================

-- A. Safeguard: Block any plaintext Stripe live/test secret keys (starts with stripe_live_ or TEST_STRIPE_KEY_)
ALTER TABLE "stripe_platform_configurations" 
ADD CONSTRAINT "check_no_plaintext_secrets_in_stripe_platform_config" 
CHECK ("stripePlatformAccountId" NOT LIKE 'stripe_live_%' AND "stripePlatformAccountId" NOT LIKE 'TEST_STRIPE_KEY_%');

-- B. Safeguard: At least one active OWNER_ADMIN must always remain in the system.
-- Trigger function to check Owner Admin retention before demoting or removing.
CREATE OR REPLACE FUNCTION verify_owner_admin_retention()
RETURNS TRIGGER AS $$
DECLARE
    active_owner_admin_count INT;
BEGIN
    -- If demoting, deleting, or changing an OWNER_ADMIN role assignment
    IF (TG_OP = 'DELETE' AND OLD.role = 'OWNER_ADMIN') OR 
       (TG_OP = 'UPDATE' AND OLD.role = 'OWNER_ADMIN' AND NEW.role <> 'OWNER_ADMIN') THEN
       
        -- Count how many OWNER_ADMIN role assignments still exist
        SELECT COUNT(*) INTO active_owner_admin_count
        FROM "user_role_assignments"
        WHERE role = 'OWNER_ADMIN' AND "userId" <> OLD."userId";
        
        IF active_owner_admin_count = 0 THEN
            RAISE EXCEPTION 'Database operation aborted: The final Owner Administrator cannot be removed, demoted, or deactivated. At least one active Owner Admin must always remain.';
        END IF;
    END IF;
    -- BEFORE DELETE triggers must return OLD; returning NEW (NULL) would
    -- silently cancel every delete on this table.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to user_role_assignments table
CREATE TRIGGER "owner_admin_retention_trigger"
BEFORE DELETE OR UPDATE ON "user_role_assignments"
FOR EACH ROW EXECUTE FUNCTION verify_owner_admin_retention();
