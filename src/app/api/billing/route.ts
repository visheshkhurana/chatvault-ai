import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { getUserPlan, getUsageSummary } from '@/lib/billing';

// GET: Get billing status and usage
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const [planInfo, usage] = await Promise.all([
      getUserPlan(user.id),
      getUsageSummary(user.id),
    ]);

    return apiSuccess({
      ...planInfo,
      usage: usage.today,
      tierName: usage.tier,
    });
  } catch (err) {
    console.error('[Billing Status] Error:', err);
    return apiError('Failed to fetch billing status', 500);
  }
});
