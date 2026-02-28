import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';

// POST: Apply a referral code for a newly signed-up user
// This should be called during onboarding or signup when a ref code is detected
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const { referralCode } = body;

    if (!referralCode || typeof referralCode !== 'string') {
      return apiError('Referral code is required', 400);
    }

    // Find the referrer by code
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from('users')
      .select('id, referral_code')
      .eq('referral_code', referralCode.toUpperCase())
      .single();

    if (referrerError || !referrer) {
      return apiError('Invalid referral code', 404);
    }

    if (referrer.id === user.id) {
      return apiError('You cannot refer yourself', 400);
    }

    // Check if the user is already referred
    const { data: existingRef } = await supabaseAdmin
      .from('users')
      .select('referred_by')
      .eq('id', user.id)
      .single();

    if (existingRef?.referred_by) {
      return apiError('You have already used a referral code', 409);
    }

    // Update the referred user's record
    await supabaseAdmin
      .from('users')
      .update({ referred_by: referrer.id })
      .eq('id', user.id);

    // Update or create the referral record
    const userEmail = user.email || '';

    // Check if there's a pending referral for this email
    const { data: pendingRef } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_email', userEmail)
      .eq('referrer_id', referrer.id)
      .single();

    if (pendingRef) {
      // Update existing referral
      await supabaseAdmin
        .from('referrals')
        .update({
          referred_user_id: user.id,
          status: 'signed_up',
        })
        .eq('id', pendingRef.id);
    } else {
      // Create new referral record
      await supabaseAdmin
        .from('referrals')
        .insert({
          referrer_id: referrer.id,
          referred_email: userEmail,
          referred_user_id: user.id,
          referral_code: referralCode.toUpperCase(),
          status: 'signed_up',
          reward_type: 'pro_days',
          reward_amount: 7,
        });
    }

    return apiSuccess({
      message: 'Referral code applied successfully',
      referrerName: 'A friend',
    });
  } catch (error) {
    console.error('[Referrals Apply] Error:', error);
    return apiError('Failed to apply referral code', 500);
  }
});
