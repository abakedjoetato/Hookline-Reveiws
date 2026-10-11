import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { splitPayment } from "@platform/config";

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey =
      this.configService.get<string>("STRIPE_SECRET_KEY") ||
      (process.env.NODE_ENV === "test" ? "sk_test_dummy_key_for_testing" : undefined);
    if (!secretKey) {
      throw new InternalServerErrorException(
        "STRIPE_SECRET_KEY is not defined in environment",
      );
    }

    this.webhookSecret =
      this.configService.get<string>("STRIPE_WEBHOOK_SECRET") || "";

    this.stripe = new Stripe(secretKey, {
      // Pinned so Stripe changes can't silently alter response shapes
      apiVersion: "2024-06-20" as any,
      appInfo: {
        name: "TheQueue",
      },
    });
  }

  async createPaymentIntent(
    amountCents: number,
    connectedAccountId: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    const feeAmount = splitPayment(amountCents).platformCents; // 15% platform fee

    return this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      application_fee_amount: feeAmount,
      transfer_data: {
        destination: connectedAccountId,
      },
      metadata,
    });
  }

  // --------------------------------------------------------------------------
  // Stripe Connect (Express accounts for hosts)
  // --------------------------------------------------------------------------

  async createExpressAccount(params: {
    email: string;
    country?: string;
    userId: string;
    hostProfileId: string;
    profileUrl?: string;
  }): Promise<Stripe.Account> {
    return this.stripe.accounts.create({
      type: "express",
      email: params.email,
      ...(params.country ? { country: params.country } : {}),
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: params.profileUrl ? { url: params.profileUrl } : undefined,
      metadata: { userId: params.userId, hostProfileId: params.hostProfileId },
    });
  }

  async createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
    return this.stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });
  }

  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.stripe.accounts.retrieve(accountId);
  }

  /** One-time link into the host's Stripe Express dashboard. */
  async createDashboardLoginLink(accountId: string): Promise<string> {
    const link = await this.stripe.accounts.createLoginLink(accountId);
    return link.url;
  }

  public verifyWebhookSignature(
    payload: string,
    signature: string,
  ): Stripe.Event {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        "STRIPE_WEBHOOK_SECRET not configured",
      );
    }
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }
}
