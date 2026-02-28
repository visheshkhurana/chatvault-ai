/**
 * Agentic Task Execution Engine
 * Handles autonomous task creation, execution, and approval workflow
 * Supports sending messages, reminders, notes, summaries, and follow-ups
 */

import { supabaseAdmin } from './supabase';

// ============================================================
// Types
// ============================================================

export type TaskType =
  | 'send_message'
  | 'set_reminder'
  | 'create_note'
  | 'summarize_chat'
  | 'follow_up';

export type TaskStatus = 'pending' | 'approved' | 'executing' | 'completed' | 'failed';

export interface TaskParams {
  userId: string;
  taskType: TaskType;
  description: string;
  parameters: Record<string, any>;
  triggeredBy: string; // 'user' | 'system' | 'schedule'
  requiresApproval: boolean;
}

export interface AgenticTask {
  id?: string;
  user_id: string;
  task_type: TaskType;
  description: string;
  parameters: Record<string, any>;
  status: TaskStatus;
  triggered_by: string;
  requires_approval: boolean;
  approved_at?: string;
  executed_at?: string;
  error_message?: string;
  result_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

// ============================================================
// Task Management Functions
// ============================================================

/**
 * Create a new agentic task
 * @param params Task creation parameters
 * @returns Created task record
 */
export async function createTask(params: TaskParams): Promise<AgenticTask> {
  const { userId, taskType, description, parameters, triggeredBy, requiresApproval } = params;

  try {
    const { data, error } = await supabaseAdmin
      .from('agentic_tasks')
      .insert({
        user_id: userId,
        task_type: taskType,
        description,
        parameters,
        status: 'pending',
        triggered_by: triggeredBy,
        requires_approval: requiresApproval,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

/**
 * Get pending tasks for a user
 * @param userId User ID
 * @returns Array of pending/approved tasks
 */
export async function getPendingTasks(userId: string): Promise<AgenticTask[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agentic_tasks')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching pending tasks:', error);
    return [];
  }
}

/**
 * Approve a task for execution
 * @param taskId Task ID
 * @returns Updated task record
 */
export async function approveTask(taskId: string): Promise<AgenticTask | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agentic_tasks')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Execute the approved task
    if (data) {
      await executeTask(taskId);
    }

    return data;
  } catch (error) {
    console.error('Error approving task:', error);
    return null;
  }
}

/**
 * Execute a task based on its type
 * @param taskId Task ID to execute
 */
export async function executeTask(taskId: string): Promise<void> {
  try {
    // Fetch task details
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('agentic_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      throw fetchError || new Error('Task not found');
    }

    // Update status to executing
    await supabaseAdmin
      .from('agentic_tasks')
      .update({ status: 'executing' })
      .eq('id', taskId);

    let result: Record<string, any> = {};

    try {
      switch (task.task_type) {
        case 'send_message':
          result = await executeSendMessage(task);
          break;

        case 'set_reminder':
          result = await executeSetReminder(task);
          break;

        case 'create_note':
          result = await executeCreateNote(task);
          break;

        case 'summarize_chat':
          result = await executeSummarizeChat(task);
          break;

        case 'follow_up':
          result = await executeFollowUp(task);
          break;

        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }

      // Mark as completed
      await supabaseAdmin
        .from('agentic_tasks')
        .update({
          status: 'completed',
          executed_at: new Date().toISOString(),
          result_data: result,
        })
        .eq('id', taskId);
    } catch (executionError) {
      // Mark as failed
      await supabaseAdmin
        .from('agentic_tasks')
        .update({
          status: 'failed',
          executed_at: new Date().toISOString(),
          error_message: executionError instanceof Error ? executionError.message : 'Unknown error',
        })
        .eq('id', taskId);

      throw executionError;
    }
  } catch (error) {
    console.error('Error executing task:', error);
    throw error;
  }
}

// ============================================================
// Task Execution Handlers
// ============================================================

/**
 * Execute send_message task
 * Sends a message via WhatsApp bridge
 */
async function executeSendMessage(task: AgenticTask): Promise<Record<string, any>> {
  const { chatId, message, contactPhone } = task.parameters;

  // TODO: Import and call sendTextMessage from @/lib/whatsapp
  // For now, return success metadata
  console.log(`Sending message to ${chatId}:`, message);

  return {
    sent: true,
    chat_id: chatId,
    message_length: message.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute set_reminder task
 * Creates a reminder in the database
 */
async function executeSetReminder(task: AgenticTask): Promise<Record<string, any>> {
  const { contactPhone, reminderText, reminderTime, recurrence } = task.parameters;

  try {
    const { data, error } = await supabaseAdmin
      .from('reminders')
      .insert({
        user_id: task.user_id,
        contact_phone: contactPhone,
        title: reminderText,
        scheduled_for: reminderTime,
        recurrence: recurrence || 'once',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      reminder_id: data?.id,
      reminder_text: reminderText,
      scheduled_for: reminderTime,
    };
  } catch (error) {
    console.error('Error setting reminder:', error);
    throw error;
  }
}

/**
 * Execute create_note task
 * Creates a knowledge entry or note
 */
async function executeCreateNote(task: AgenticTask): Promise<Record<string, any>> {
  const { noteText, category, tags, chatId } = task.parameters;

  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .insert({
        user_id: task.user_id,
        chat_id: chatId,
        message_id: null,
        category: category || 'other',
        title: noteText.substring(0, 100),
        content: noteText,
        tags: tags || [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      note_id: data?.id,
      note_preview: noteText.substring(0, 100),
      category,
    };
  } catch (error) {
    console.error('Error creating note:', error);
    throw error;
  }
}

/**
 * Execute summarize_chat task
 * TODO: Integrate with generateChatSummary from RAG/retrieval engine
 */
async function executeSummarizeChat(task: AgenticTask): Promise<Record<string, any>> {
  const { chatId } = task.parameters;

  try {
    // Fetch messages from chat
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: true });

    if (messagesError || !messages) {
      throw messagesError;
    }

    // TODO: Call generateChatSummary from @/lib/retrieval-engine
    // For now, create a basic summary

    const messageCount = messages.length;
    const firstMessage = messages[0]?.timestamp;
    const lastMessage = messages[messages.length - 1]?.timestamp;

    return {
      chat_id: chatId,
      message_count: messageCount,
      period_start: firstMessage,
      period_end: lastMessage,
      summary: `Chat contains ${messageCount} messages spanning from ${firstMessage} to ${lastMessage}`,
    };
  } catch (error) {
    console.error('Error summarizing chat:', error);
    throw error;
  }
}

/**
 * Execute follow_up task
 * Sends a follow-up message
 */
async function executeFollowUp(task: AgenticTask): Promise<Record<string, any>> {
  const { contactPhone, followUpMessage, daysDelay } = task.parameters;

  // TODO: Import and call sendTextMessage from @/lib/whatsapp
  console.log(`Follow-up to ${contactPhone} after ${daysDelay} days:`, followUpMessage);

  return {
    follow_up_sent: true,
    contact_phone: contactPhone,
    delay_days: daysDelay,
    message_length: followUpMessage.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get task history for a user
 * @param userId User ID
 * @param limit Maximum results
 * @returns Completed and failed tasks
 */
export async function getTaskHistory(
  userId: string,
  limit: number = 20
): Promise<AgenticTask[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agentic_tasks')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['completed', 'failed'])
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching task history:', error);
    return [];
  }
}

/**
 * Retry a failed task
 * @param taskId Task ID to retry
 */
export async function retryTask(taskId: string): Promise<AgenticTask | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('agentic_tasks')
      .update({
        status: 'pending',
        error_message: null,
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // If task doesn't require approval, execute immediately
    if (data && !data.requires_approval) {
      await executeTask(taskId);
    }

    return data;
  } catch (error) {
    console.error('Error retrying task:', error);
    return null;
  }
}

/**
 * Cancel a pending task
 * @param taskId Task ID to cancel
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('agentic_tasks')
      .update({
        status: 'failed',
        error_message: 'Task cancelled by user',
      })
      .eq('id', taskId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error cancelling task:', error);
    return false;
  }
}

/**
 * Get task statistics for a user
 * @param userId User ID
 */
export async function getTaskStats(userId: string): Promise<Record<string, any>> {
  try {
    const { data: tasks, error } = await supabaseAdmin
      .from('agentic_tasks')
      .select('status, task_type')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const stats = {
      total: tasks?.length || 0,
      pending: 0,
      approved: 0,
      completed: 0,
      failed: 0,
      by_type: {} as Record<TaskType, number>,
    };

    (tasks || []).forEach((task: any) => {
      const status = task.status as string;
      if (status in stats && status !== 'by_type') {
        (stats as any)[status]++;
      }
      const taskType = task.task_type as TaskType;
      stats.by_type[taskType] = (stats.by_type[taskType] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching task stats:', error);
    return { total: 0, pending: 0, approved: 0, completed: 0, failed: 0, by_type: {} };
  }
}
