import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Message Templates API
// GET /api/templates - List all templates for user
// POST /api/templates - Create new template
// PATCH /api/templates - Update template
// DELETE /api/templates - Delete template
// POST with action 'use' - Mark template as used
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    const { data: templates, error } = await supabaseAdmin
        .from('message_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false, nullsFirst: true });

    if (error) {
        console.error('[Templates] Error fetching:', error);
        return apiError('Failed to fetch templates', 500);
    }

    return apiSuccess({ templates: templates || [] });
});

// Schema for creating a new template
const createTemplateSchema = z.object({
    name: z.string().min(1).max(100),
    content: z.string().min(1).max(4000),
    category: z.string().max(50).optional(),
    variables: z.array(z.string()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, createTemplateSchema);
    if (!parsed.success) return parsed.response;

    const { name, content, category, variables } = parsed.data as z.infer<typeof createTemplateSchema>;

    const { data: template, error } = await supabaseAdmin
        .from('message_templates')
        .insert({
            user_id: user.id,
            name,
            content,
            category: category || null,
            variables: variables || [],
            use_count: 0,
            last_used_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('[Templates] Error creating:', error);
        return apiError('Failed to create template', 500);
    }

    return apiSuccess({ template }, 201);
});

// Schema for updating a template
const updateTemplateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    content: z.string().min(1).max(4000).optional(),
    category: z.string().max(50).nullable().optional(),
    variables: z.array(z.string()).optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, updateTemplateSchema);
    if (!parsed.success) return parsed.response;

    const { id, name, content, category, variables } = parsed.data as z.infer<typeof updateTemplateSchema>;

    // Build update payload (only include provided fields)
    const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name;
    if (content !== undefined) updatePayload.content = content;
    if (category !== undefined) updatePayload.category = category;
    if (variables !== undefined) updatePayload.variables = variables;

    const { data: template, error } = await supabaseAdmin
        .from('message_templates')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('[Templates] Error updating:', error);
        return apiError('Failed to update template', 500);
    }

    if (!template) {
        return apiError('Template not found', 404);
    }

    return apiSuccess({ template });
});

// Schema for deleting a template
const deleteTemplateSchema = z.object({
    id: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, deleteTemplateSchema);
    if (!parsed.success) return parsed.response;

    const { id } = parsed.data as z.infer<typeof deleteTemplateSchema>;

    const { error } = await supabaseAdmin
        .from('message_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) {
        console.error('[Templates] Error deleting:', error);
        return apiError('Failed to delete template', 500);
    }

    return apiSuccess({ success: true });
});

// ============================================================
// Additional action: Mark template as used
// POST /api/templates with action: 'use' and id
// ============================================================

const useTemplateSchema = z.object({
    action: z.literal('use'),
    id: z.string().uuid(),
});

// Helper function to handle the 'use' action
export const markTemplateAsUsed = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, useTemplateSchema);
    if (!parsed.success) return parsed.response;

    const { id } = parsed.data as z.infer<typeof useTemplateSchema>;

    // Get current use_count and last_used_at
    const { data: template, error: selectError } = await supabaseAdmin
        .from('message_templates')
        .select('use_count')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (selectError || !template) {
        console.error('[Templates] Error fetching for use:', selectError);
        return apiError('Template not found', 404);
    }

    // Update use_count and last_used_at
    const { data: updatedTemplate, error: updateError } = await supabaseAdmin
        .from('message_templates')
        .update({
            use_count: (template.use_count || 0) + 1,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (updateError) {
        console.error('[Templates] Error marking as used:', updateError);
        return apiError('Failed to mark template as used', 500);
    }

    return apiSuccess({ template: updatedTemplate });
});
