import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

function createSupabaseRouteClient(request: NextRequest) {
    const cookiesToSet: Array<{
        name: string;
        value: string;
        options: any;
    }> = [];

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(newCookies) {
                    cookiesToSet.push(...newCookies);
                },
            },
        }
    );

    const applyCookies = (response: NextResponse) => {
        cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
        });
        return response;
    };

    const apiSuccess = (data: unknown) =>
        applyCookies(NextResponse.json({ success: true, data }));
    const apiError = (message: string, status = 400) =>
        applyCookies(NextResponse.json({ success: false, error: message }, { status }));

    return { supabase, apiSuccess, apiError };
}

// POST /api/feature-events — log a feature usage event
export async function POST(request: NextRequest) {
    try {
          const { supabase, apiSuccess, apiError } = createSupabaseRouteClient(request);
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return apiError('Unauthorized', 401);

      const body = await request.json();
          const { event_name, event_category, metadata } = body;

      if (!event_name) return apiError('event_name is required');

      const { error } = await supabase
            .from('feature_events')
            .insert({
                      user_id: user.id,
                      event_name,
                      event_category: event_category || 'general',
                      metadata: metadata || {},
            });

      if (error) return apiError('Failed to log event', 500);

      return apiSuccess({ logged: true });
    } catch (err) {
          return apiError('Failed to log feature event', 500);
    }
}

// GET /api/feature-events — get feature usage stats for current user
export async function GET(request: NextRequest) {
    try {
          const { supabase, apiSuccess, apiError } = createSupabaseRouteClient(request);
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return apiError('Unauthorized', 401);

      const url = new URL(request.url);
          const days = parseInt(url.searchParams.get('days') || '30');
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: events, error } = await supabase
            .from('feature_events')
            .select('event_name, event_category, created_at')
            .eq('user_id', user.id)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(500);

      if (error) return apiError('Failed to fetch events', 500);

      // Aggregate by feature
      const featureMap: Record<string, number> = {};
          for (const event of events || []) {
                  featureMap[event.event_name] = (featureMap[event.event_name] || 0) + 1;
          }

      return apiSuccess({
              total_events: events?.length || 0,
              feature_usage: featureMap,
              period_days: days,
      });
    } catch (err) {
          return apiError('Failed to fetch feature events', 500);
    }
}
