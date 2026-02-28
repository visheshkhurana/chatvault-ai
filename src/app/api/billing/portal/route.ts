import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover' as any,
});

// POST: Create Stripe Customer Portal session (manage subscription)
export const POST = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return apiError('No billing account found', 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://chatvault-ai.vercel.app'}/dashboard`,
    });

    return apiSuccess({ url: session.url });
  } catch (err) {
    console.error('[Billing Portal] Error:', err);
    return apiError('Failed to create portal session', 500);
  }
});
