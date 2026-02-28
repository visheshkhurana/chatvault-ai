import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// GET: Fetch user's referral code + referral stats
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    // Get user's referral code
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('referral_code')
      .eq('id', user.id)
      .single();

    if (userError) throw userError;

    let referralCode = userData?.referral_code;

    // Generate code if missing
    if (!referralCode) {
      referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      await supabaseAdmin
        .from('users')
        .update({ referral_code: referralCode })
        .eq('id', user.id);
    }

    // Fetch all referrals by this user
    const { data: referrals, error: refError } = await supabaseAdmin
      .from('referrals')
      .select('id, referred_email, status, reward_type, reward_amount, created_at')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false });

    if (refError) throw refError;

    const referralList = referrals || [];

    // Calculate stats
    const totalReferred = referralList.length;
    const signedUp = referralList.filter(r => r.status === 'signed_up' || r.status === 'activated' || r.status === 'rewarded').length;
    const activated = referralList.filter(r => r.status === 'activated' || r.status === 'rewarded').length;
    const rewarded = referralList.filter(r => r.status === 'rewarded').length;
    const totalProDaysEarned = referralList
      .filter(r => r.status === 'rewarded' && r.reward_type === 'pro_days')
      .reduce((sum, r) => sum + (r.reward_amount || 0), 0);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chatvault-ai.vercel.app';
    const referralLink = `${appUrl}/signup?ref=${referralCode}`;

    return apiSuccess({
      referralCode,
      referralLink,
      stats: {
        totalReferred,
        signedUp,
        activated,
        rewarded,
        totalProDaysEarned,
      },
      referrals: referralList,
    });
  } catch (error) {
    console.error('[Referrals GET] Error:', error);
    return apiError('Failed to fetch referrals', 500);
  }
});

// POST: Send a referral invite (track email)
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return apiError('Email is required', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError('Invalid email format', 400);
    }

    // Get user's referral code
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('referral_code, email')
      .eq('id', user.id)
      .single();

    if (userData?.email === email) {
      return apiError('You cannot refer yourself', 400);
    }

    const referralCode = userData?.referral_code;
    if (!referralCode) {
      return apiError('Referral code not found. Please try again.', 400);
    }

    // Check if email is already referred
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('id, status')
      .eq('referred_email', email)
      .single();

    if (existing) {
      return apiError('This email has already been referred', 409);
    }

    // Check if email is already a user
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return apiError('This person already has a Rememora account', 409);
    }

    // Create referral record
    const { data: referral, error: insertError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: user.id,
        referred_email: email,
        referral_code: referralCode,
        status: 'pending',
        reward_type: 'pro_days',
        reward_amount: 7,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return apiError('This email has already been referred', 409);
      }
      throw insertError;
    }

    return apiSuccess({
      message: 'Referral tracked successfully',
      referral: {
        id: referral.id,
        email: referral.referred_email,
        status: referral.status,
      },
    });
  } catch (error) {
    console.error('[Referrals POST] Error:', error);
    return apiError('Failed to create referral', 500);
  }
});
