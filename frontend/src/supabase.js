import { createClient } from '@supabase/supabase-js';

// Hardcode your Supabase URL and key directly
const supabaseUrl = 'https://kuvphinebpvwphpgwhka.supabase.co';
const supabaseAnonKey = 'sb_publishable_A2b4eubi1qaugWooS-i1dA_1nOsnFIN';

// Log to verify
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key are required');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const signInWithGoogle = async () => {
  try {
    console.log('Attempting Google sign-in...');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    console.log('✅ Sign-in successful');
  } catch (err) {
    console.error('❌ Sign-in error:', err);
    throw err;
  }
};

export const signOut = async () => {
  try {
    console.log('Signing out...');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    console.log('✅ Signed out');
  } catch (err) {
    console.error('❌ Sign-out error:', err);
    throw err;
  }
};

// Workflow CRUD operations with Supabase - UPDATED FOR YOUR SCHEMA
export const workflowDB = {
  // Get all workflows for current user (as creator OR as assignee)
  async getWorkflows() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    console.log('Fetching workflows for user:', user.email);
    
    // Get workflows where user is creator OR assigned_to matches user's email
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .or(`created_by.eq.${user.id},assigned_to.eq.${user.email}`)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log('Fetched workflows:', data);
    return data;
  },

  // Create a new workflow
  async createWorkflow(workflowData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    const workflow = {
      name: workflowData.name,
      description: workflowData.description,
      version: workflowData.version || 1,
      status: workflowData.status || 'pending',
      input_schema: workflowData.input_schema,
      steps: workflowData.steps || [],
      rules: workflowData.rules || [],
      created_by: user.id,  // Using created_by instead of user_id
      assigned_to: workflowData.assigned_to || null, // Optional: who it's assigned to
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('Creating workflow:', workflow);
    
    const { data, error } = await supabase
      .from('workflows')
      .insert([workflow])
      .select();
      
    if (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
    
    return data[0];
  },

  // Update a workflow
  async updateWorkflow(id, updates) {
    const { data, error } = await supabase
      .from('workflows')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
      
    if (error) {
      console.error('Error updating workflow:', error);
      throw error;
    }
    
    return data[0];
  },

  // Delete a workflow
  async deleteWorkflow(id) {
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id);
      
    if (error) {
      console.error('Error deleting workflow:', error);
      throw error;
    }
    
    return true;
  },

  // Create an execution
  async createExecution(executionData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    const execution = {
      workflow_id: executionData.workflow_id,
      workflow_version: executionData.workflow_version,
      status: 'pending',
      data: executionData.data,
      logs: [],
      triggered_by: user.id,
      started_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('executions')
      .insert([execution])
      .select();
      
    if (error) {
      console.error('Error creating execution:', error);
      throw error;
    }
    
    return data[0];
  },

  // Update execution status
  async updateExecution(id, status, logs = []) {
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'completed' || status === 'failed') {
      updates.ended_at = new Date().toISOString();
    }
    
    if (logs.length > 0) {
      updates.logs = logs;
    }
    
    const { data, error } = await supabase
      .from('executions')
      .update(updates)
      .eq('id', id)
      .select();
      
    if (error) {
      console.error('Error updating execution:', error);
      throw error;
    }
    
    return data[0];
  },

  // Get executions for a workflow
  async getExecutions(workflowId = null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    let query = supabase
      .from('executions')
      .select('*, workflows(name)')
      .eq('triggered_by', user.id)
      .order('created_at', { ascending: false });
      
    if (workflowId) {
      query = query.eq('workflow_id', workflowId);
    }
    
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching executions:', error);
      throw error;
    }
    
    return data;
  },

  // Submit workflow for team approval
  async submitForApproval(workflowId, comments = '') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    // Get the workflow first
    const workflows = await this.getWorkflows();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    // Update workflow - assign to manager/team email
    const { data, error } = await supabase
      .from('workflows')
      .update({
        assigned_to: 'pravarthinivijay06@gmail.com', // Team email for approval
        status: 'submitted',
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId)
      .select();
      
    if (error) throw error;
    
    return data[0];
  },

  // Get workflows assigned to current user (for managers/approvers)
  async getAssignedWorkflows() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('assigned_to', user.email)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  },

  // Approve or reject a workflow (for managers)
  async reviewWorkflow(workflowId, status, comments = '') {
    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('Status must be either approved or rejected');
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user logged in');
    
    const updates = {
      status,
      rejection_reason: status === 'rejected' ? comments : null,
      assigned_to: null, // Clear assignment after review
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('workflows')
      .update(updates)
      .eq('id', workflowId)
      .select();
      
    if (error) throw error;
    return data[0];
  }
};