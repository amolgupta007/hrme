import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("x-razorpay-signature")!;

  // Verify webhook signature
  const expectedSignature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Razorpay webhook verification failed");
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const event = JSON.parse(body);
  const supabase = createAdminSupabase();

  try {
    switch (event.event) {
      case "subscription.activated": {
        const subscription = event.payload.subscription.entity;
        const orgId = subscription.notes?.org_id;
        const planKey = subscription.notes?.plan;

        if (orgId && planKey) {
          await supabase
            .from("organizations")
            .update({
              stripe_subscription_id: subscription.id,
              plan: planKey,
              max_employees: planKey === "business" ? 500 : 200,
            })
            .eq("id", orgId);
        }
        break;
      }

      case "subscription.charged": {
        // Subscription payment successful — subscription remains active
        break;
      }

      case "subscription.cancelled":
      case "subscription.completed": {
        const subscription = event.payload.subscription.entity;

        await supabase
          .from("organizations")
          .update({
            plan: "starter",
            max_employees: 10,
            stripe_subscription_id: null,
            stripe_customer_id: null,
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "subscription.paused": {
        const subscription = event.payload.subscription.entity;
        console.warn(`Subscription ${subscription.id} paused`);
        // TODO: Send warning email via Resend
        break;
      }

      case "payment.failed": {
        const payment = event.payload.payment.entity;
        console.error(`Payment failed: ${payment.id}`);
        // TODO: Send payment failure email via Resend
        break;
      }

      default:
        console.warn(`Unhandled Razorpay event: ${event.event}`);
    }
  } catch (error) {
    console.error(`Error processing Razorpay webhook ${event.event}:`, error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
