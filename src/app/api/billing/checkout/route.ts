import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover' as any,
});

// POST: Create a Stripe Checkout session for Pro upgrade
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return apiError('Stripe not configured', 500);
  }

  try {
    // Check if user already has a Stripe customer ID
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, plan, status')
      .eq('user_id', user.id)
      .single();

    if (sub?.plan === 'pro' && sub?.status === 'active') {
      return apiError('Already subscribed to Pro', 400);
    }

    let customerId = sub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID
      await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          plan: 'free',
          status: 'active',
        }, { onConflict: 'user_id' });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://chatvault-ai.vercel.app'}/dashboard?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://chatvault-ai.vercel.app'}/dashboard?billing=cancelled`,
      metadata: { user_id: user.id },
    });

    return apiSuccess({ url: session.url });
  } catch (err) {
    console.error('[Billing Checkout] Error:', err);
    return apiError('Failed to create checkout session', 500);
  }
});
