import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { PaymentFailedEmail } from "@/components/emails/payment-failed";

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

  // Dedupe: skip if we've already processed this event id.
  // Razorpay retries failed deliveries; without this, duplicate emails fire.
  const eventId = event.id as string | undefined;
  if (eventId) {
    const { error: dedupeError } = await supabase
      .from("webhook_events")
      .insert({ id: eventId, event_type: event.event });
    if (dedupeError && dedupeError.code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
    if (dedupeError) {
      console.error("webhook_events insert failed:", dedupeError);
    }
  }

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

        // Look up org to get admin email
        const { data: org } = await supabase
          .from("organizations")
          .select("id, name")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (org) {
          const orgData = org as { id: string; name: string };
          const { data: admins } = await supabase
            .from("employees")
            .select("email, first_name")
            .eq("org_id", orgData.id)
            .in("role", ["owner", "admin"])
            .eq("status", "active");

          if (admins && admins.length > 0) {
            const html = await render(
              PaymentFailedEmail({
                orgName: orgData.name,
                planName: "subscription",
                paymentId: subscription.id,
                dashboardUrl: "https://jambahr.com/dashboard/settings",
              })
            );

            await resend.emails.send({
              from: FROM_EMAIL,
              to: (admins as { email: string; first_name: string }[]).map((a) => a.email),
              subject: "JambaHR – Your subscription has been paused",
              html,
            });
          }
        }
        break;
      }

      case "payment.failed": {
        const payment = event.payload.payment.entity;
        console.error(`Payment failed: ${payment.id}`);

        // Find the org via subscription ID
        const subId = payment.subscription_id;
        if (subId) {
          const { data: org } = await supabase
            .from("organizations")
            .select("id, name, plan")
            .eq("stripe_subscription_id", subId)
            .single();

          if (org) {
            const orgData = org as { id: string; name: string; plan: string };
            const { data: admins } = await supabase
              .from("employees")
              .select("email, first_name")
              .eq("org_id", orgData.id)
              .in("role", ["owner", "admin"])
              .eq("status", "active");

            if (admins && admins.length > 0) {
              try {
                const planLabel =
                  orgData.plan === "business" ? "Business" : "Growth";
                const amountStr = payment.amount
                  ? `₹${(payment.amount / 100).toLocaleString("en-IN")}`
                  : undefined;

                const html = await render(
                  PaymentFailedEmail({
                    orgName: orgData.name,
                    planName: planLabel,
                    paymentId: payment.id,
                    amount: amountStr,
                    dashboardUrl: "https://jambahr.com/dashboard/settings",
                  })
                );

                await resend.emails.send({
                  from: FROM_EMAIL,
                  to: (admins as { email: string; first_name: string }[]).map(
                    (a) => a.email
                  ),
                  subject: "JambaHR – Payment Failed: Action Required",
                  html,
                });
              } catch (emailErr) {
                console.error("Failed to send payment failure email:", emailErr);
              }
            }
          }
        }
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
