import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/server";
import type Stripe from "stripe";

/**
 * Stripe Webhook Handler
 *
 * Manages subscription events to keep Supabase in sync.
 * Configure in Stripe Dashboard → Webhooks:
 *   URL: https://yourdomain.com/api/webhooks/stripe
 *   Events: checkout.session.completed, customer.subscription.updated,
 *           customer.subscription.deleted, invoice.payment_failed
 */

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("Stripe-Signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Stripe webhook verification failed:", err.message);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;
        const planKey = session.metadata?.plan;

        if (orgId && session.subscription) {
          await supabase
            .from("organizations")
            .update({
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              plan: planKey as any,
              max_employees:
                planKey === "business"
                  ? 500
                  : planKey === "growth"
                    ? 200
                    : 10,
            })
            .eq("id", orgId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;

        if (status === "active" || status === "trialing") {
          // Subscription is healthy — no action needed
        } else if (status === "past_due" || status === "unpaid") {
          // TODO: Send warning email, maybe restrict features
          console.warn(
            `Subscription ${subscription.id} is ${status}`
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        // Downgrade to starter plan
        await supabase
          .from("organizations")
          .update({
            plan: "starter",
            max_employees: 10,
            stripe_subscription_id: null,
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error(
          `Payment failed for customer ${invoice.customer}`
        );
        // TODO: Send payment failure email via Resend
        break;
      }

      default:
        console.warn(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (error) {
    console.error(`Error processing Stripe webhook ${event.type}:`, error);
    return NextResponse.json(
      { error: "Internal processing error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
