import { corsHeaders, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature) {
      console.warn("[stripe-webhook] Missing stripe-signature header");
      return jsonResponse({ error: "Missing signature" }, 400);
    }

    // TODO: Validate signature using STRIPE_WEBHOOK_SECRET

    const event = JSON.parse(body);
    const eventType = event?.type ?? "unknown";

    console.log(`[stripe-webhook] Received event: ${eventType}`);

    switch (eventType) {
      case "checkout.session.completed":
        console.log("[stripe-webhook] Checkout completed");
        break;
      case "invoice.paid":
        console.log("[stripe-webhook] Invoice paid");
        break;
      case "invoice.payment_failed":
        console.log("[stripe-webhook] Payment failed");
        break;
      case "customer.subscription.updated":
        console.log("[stripe-webhook] Subscription updated");
        break;
      case "customer.subscription.deleted":
        console.log("[stripe-webhook] Subscription deleted");
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${eventType}`);
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return jsonResponse({ error: "Processing error" }, 400);
  }
});
