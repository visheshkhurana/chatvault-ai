import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Agentic Tasks API
// GET /api/agentic-tasks — List user's tasks by status
// POST /api/agentic-tasks — Create a new task
// PATCH /api/agentic-tasks — Approve or cancel a task
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('agentic_tasks')
      .select('*')
      .eq('user_id', user.id);

    if (status && ['pending', 'approved', 'running', 'completed', 'failed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: tasks, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Agentic Tasks] Query error:', error);
      return apiError('Failed to fetch tasks', 500);
    }

    return apiSuccess(tasks || []);
  } catch (err) {
    console.error('[Agentic Tasks] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const createTaskSchema = z.object({
  taskType: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(z.any()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, createTaskSchema);
  if (!parsed.success) return parsed.response;

  const { taskType, description, parameters } =
    parsed.data as z.infer<typeof createTaskSchema>;

  try {
    const { data: task, error } = await supabaseAdmin
      .from('agentic_tasks')
      .insert({
        user_id: user.id,
        task_type: taskType,
        description,
        parameters: parameters || {},
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Agentic Tasks] Insert error:', error);
      return apiError('Failed to create task', 500);
    }

    return apiSuccess(task, 201);
  } catch (err) {
    console.error('[Agentic Tasks] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const approveTaskSchema = z.object({
  taskId: z.string().uuid(),
  action: z.enum(['approve', 'cancel']),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, approveTaskSchema);
  if (!parsed.success) return parsed.response;

  const { taskId, action } = parsed.data as z.infer<typeof approveTaskSchema>;

  try {
    let newStatus = 'cancelled';
    if (action === 'approve') {
      // In a real app, would call executeTask here
      newStatus = 'running';
    }

    const { error } = await supabaseAdmin
      .from('agentic_tasks')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Agentic Tasks] Update error:', error);
      return apiError('Failed to update task', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Agentic Tasks] Error:', err);
    return apiError('Internal server error', 500);
  }
});
