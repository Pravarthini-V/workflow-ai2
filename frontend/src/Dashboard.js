import React, { useState, useEffect } from 'react';
import { signOut, workflowDB } from './supabase';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function Dashboard({ user }) {
  const [workflows, setWorkflows] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupMsg, setPopupMsg] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [editingStep, setEditingStep] = useState(null);
  const [newStep, setNewStep] = useState({ name: '', type: 'approval' });
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const showMessage = (msg, isError = false) => {
    setPopupMsg(msg);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 3000);
  };

  const fetchWorkflows = async () => {
    try {
      setFetchError(null);
      console.log('Fetching workflows for user:', user?.email);
      
      const data = await workflowDB.getWorkflows();
      console.log('Fetched workflows:', data);
      
      setWorkflows(data || []);
      
      if (data && data.length > 0) {
        showMessage(`✅ Loaded ${data.length} workflows`);
      } else {
        showMessage('📭 No workflows found');
      }
    } catch (err) {
      console.error('Error fetching workflows:', err);
      
      let errorMsg = '❌ Failed to fetch workflows';
      if (err.message) errorMsg += `: ${err.message}`;
      
      if (err.code === 'PGRST301') {
        errorMsg = '❌ Database connection error. Please check your Supabase configuration.';
      } else if (err.code === '42P01') {
        errorMsg = '❌ Workflows table does not exist. Please create it in Supabase.';
      } else if (err.message?.includes('JWT')) {
        errorMsg = '❌ Authentication error. Please try logging out and back in.';
      }
      
      showMessage(errorMsg, true);
      setFetchError(errorMsg);
      setWorkflows([]);
    }
  };

  const handleSendToTeam = async (workflow) => {
    try {
      setLoading(true);
      
      const workflowDetails = `
WORKFLOW: ${workflow.name}
Version: ${workflow.version}
Description: ${workflow.description}

INPUT SCHEMA:
${Object.entries(workflow.input_schema || {}).map(([key, value]) => 
  `- ${key}: ${value.type} ${value.required ? '(required)' : '(optional)'}${value.allowed_values ? ` (${value.allowed_values.join('|')})` : ''}`
).join('\n')}

STEPS:
${workflow.steps?.map((step, index) => 
  `${index + 1}. ${step.name} (${step.type}) - Assignee: ${step.metadata?.assignee || 'Not assigned'}`
).join('\n')}

RULES:
${workflow.rules?.map(rule => 
  `- Priority ${rule.priority}: IF ${rule.condition} THEN go to step ${rule.next_step}`
).join('\n')}

Created by: ${user.email}
      `;

      const subject = encodeURIComponent(`Workflow Approval Required: ${workflow.name}`);
      const body = encodeURIComponent(workflowDetails);
      const mailtoLink = `mailto:pravarthinivijay06@gmail.com?subject=${subject}&body=${body}`;
      
      window.location.href = mailtoLink;
      showMessage('📧 Email draft opened in your default email client');
      
    } catch (err) {
      console.error('Error sending to team:', err);
      showMessage('❌ Failed to open email client', true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStep = () => {
    if (!selectedWorkflow) return;
    
    const newStepObj = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newStep.name || 'New Step',
      type: newStep.type,
      order: (selectedWorkflow.steps?.length || 0) + 1,
      metadata: {}
    };
    
    const updatedWorkflow = {
      ...selectedWorkflow,
      steps: [...(selectedWorkflow.steps || []), newStepObj]
    };
    
    setSelectedWorkflow(updatedWorkflow);
    setWorkflows(workflows.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
    
    workflowDB.updateWorkflow(selectedWorkflow.id, { steps: updatedWorkflow.steps })
      .then(() => showMessage('✅ Step added'))
      .catch(err => {
        console.error('Error adding step:', err);
        showMessage('❌ Failed to add step', true);
      });
    
    setNewStep({ name: '', type: 'approval' });
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input };
    setMessages([...messages, userMsg]);
    setInput('');
    setLoading(true);

    try {
      console.log('Sending to:', `${API_URL}/api/chat`);
      const res = await axios.post(`${API_URL}/api/chat`, { message: input });
      console.log('Chat response:', res.data);
      
      const responseText = res.data.message || res.data.response || 'No response';
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: responseText
      }]);

      const shouldCreateWorkflow = input.toLowerCase().includes('create') || 
                                  input.toLowerCase().includes('make') || 
                                  input.toLowerCase().includes('new workflow') ||
                                  input.toLowerCase().includes('rupees') || 
                                  input.toLowerCase().includes('rs') || 
                                  input.toLowerCase().includes('₹') ||
                                  input.toLowerCase().includes('expense') ||
                                  input.toLowerCase().includes('amount');
      
      if (shouldCreateWorkflow) {
        await handleCreateWorkflowFromChat(input);
      }

    } catch (err) {
      console.error('Chat error:', err);
      let errorMsg = '❌ Error: ' + err.message;
      
      if (err.code === 'ECONNREFUSED') {
        errorMsg = '❌ Cannot connect to server. Make sure the backend is running at ' + API_URL;
      }
      
      showMessage(errorMsg, true);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, error processing request.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflowFromChat = async (input) => {
    try {
      const amountMatch = input.match(/(\d+)/);
      const amount = amountMatch ? parseInt(amountMatch[0]) : 5000;
      
      let workflowName = 'Expense Approval';
      let workflowDesc = `Expense approval workflow for ${amount} rupees`;
      
      if (input.toLowerCase().includes('onboarding')) {
        workflowName = 'Employee Onboarding';
        workflowDesc = 'New employee onboarding workflow';
      } else if (input.toLowerCase().includes('invoice')) {
        workflowName = 'Invoice Processing';
        workflowDesc = 'Vendor invoice processing workflow';
      }
      
      const rules = [];
      
      if (amount > 10000) {
        rules.push({ id: `rule-${Date.now()}-1`, step_id: `step-${Date.now()}-1`, condition: `amount > 10000`, next_step: '3', priority: 1 });
        rules.push({ id: `rule-${Date.now()}-2`, step_id: `step-${Date.now()}-1`, condition: `amount > 1000 && amount <= 10000`, next_step: '2', priority: 2 });
        rules.push({ id: `rule-${Date.now()}-3`, step_id: `step-${Date.now()}-1`, condition: `amount <= 1000`, next_step: '1', priority: 3 });
      } else if (amount > 1000) {
        rules.push({ id: `rule-${Date.now()}-1`, step_id: `step-${Date.now()}-1`, condition: `amount > 5000`, next_step: '3', priority: 1 });
        rules.push({ id: `rule-${Date.now()}-2`, step_id: `step-${Date.now()}-1`, condition: `amount <= 5000 && amount > 1000`, next_step: '2', priority: 2 });
        rules.push({ id: `rule-${Date.now()}-3`, step_id: `step-${Date.now()}-1`, condition: `amount <= 1000`, next_step: '1', priority: 3 });
      } else {
        rules.push({ id: `rule-${Date.now()}-1`, step_id: `step-${Date.now()}-1`, condition: `amount > 500`, next_step: '2', priority: 1 });
        rules.push({ id: `rule-${Date.now()}-2`, step_id: `step-${Date.now()}-1`, condition: `amount <= 500`, next_step: '1', priority: 2 });
      }
      
      rules.push({ id: `rule-${Date.now()}-4`, step_id: `step-${Date.now()}-1`, condition: 'DEFAULT', next_step: '4', priority: 999 });
      
      const newWorkflow = {
        name: workflowName,
        description: workflowDesc,
        version: 3,
        status: 'pending',
        input_schema: {
          amount: { type: 'number', required: true },
          country: { type: 'string', required: true, allowed_values: ['US', 'UK', 'IN', 'DE', 'FR', 'JP'] },
          department: { type: 'string', required: false, allowed_values: ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'] },
          priority: { type: 'string', required: true, allowed_values: ['High', 'Medium', 'Low'] }
        },
        steps: [
          { id: `step-${Date.now()}-1`, name: 'Manager Approval', type: 'approval', order: 1, metadata: { assignee: 'manager.role12@gmail.com' } },
          { id: `step-${Date.now()}-2`, name: 'Finance Review', type: 'approval', order: 2, metadata: { assignee: 'finance@example.com' } },
          { id: `step-${Date.now()}-3`, name: 'CEO Approval', type: 'approval', order: 3, metadata: { assignee: 'ceo@example.com' } },
          { id: `step-${Date.now()}-4`, name: 'Task Rejection', type: 'task', order: 4, metadata: { action: 'send_rejection_email' } }
        ],
        rules: rules
      };
      
      console.log('Creating workflow:', JSON.stringify(newWorkflow, null, 2));
      const saved = await workflowDB.createWorkflow(newWorkflow);
      console.log('Workflow saved:', JSON.stringify(saved, null, 2));
      
      setWorkflows(prev => [...prev, saved]);
      setSelectedWorkflow(saved);
      showMessage(`✅ Workflow created for ${amount} rupees with ${rules.length} rules!`);
      
    } catch (err) {
      console.error('Error creating workflow:', err);
      showMessage('❌ Failed to create workflow: ' + err.message, true);
    }
  };

  const handleDelete = async (id) => {
    try {
      await workflowDB.deleteWorkflow(id);
      setWorkflows(workflows.filter(w => w.id !== id));
      if (selectedWorkflow?.id === id) setSelectedWorkflow(null);
      showMessage('✅ Workflow deleted from database');
    } catch (err) {
      console.error('Delete error:', err);
      showMessage('❌ Delete failed: ' + err.message, true);
    }
  };

  const handleEdit = (workflow) => {
    setEditingId(workflow.id);
    setEditName(workflow.name);
    setEditDesc(workflow.description || '');
  };

  const handleSaveEdit = async (id) => {
    try {
      const updated = await workflowDB.updateWorkflow(id, {
        name: editName,
        description: editDesc
      });
      
      setWorkflows(workflows.map(w => w.id === id ? updated : w));
      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(updated);
      }
      setEditingId(null);
      showMessage('✅ Workflow updated in database');
    } catch (err) {
      console.error('Update error:', err);
      showMessage('❌ Update failed: ' + err.message, true);
    }
  };

  const handleStepEdit = (step) => {
    setEditingStep(step);
  };

  const handleStepDelete = (stepId) => {
    if (selectedWorkflow) {
      const updatedWorkflow = {
        ...selectedWorkflow,
        steps: selectedWorkflow.steps.filter(s => s.id !== stepId)
      };
      setSelectedWorkflow(updatedWorkflow);
      setWorkflows(workflows.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
      
      workflowDB.updateWorkflow(selectedWorkflow.id, { steps: updatedWorkflow.steps })
        .then(() => showMessage('✅ Step deleted'))
        .catch(err => console.error('Error updating steps:', err));
    }
  };

  const handleStepSave = (updatedStep) => {
    if (selectedWorkflow) {
      const updatedWorkflow = {
        ...selectedWorkflow,
        steps: selectedWorkflow.steps.map(s => s.id === updatedStep.id ? updatedStep : s)
      };
      setSelectedWorkflow(updatedWorkflow);
      setWorkflows(workflows.map(w => w.id === updatedWorkflow.id ? updatedWorkflow : w));
      setEditingStep(null);
      
      workflowDB.updateWorkflow(selectedWorkflow.id, { steps: updatedWorkflow.steps })
        .then(() => showMessage('✅ Step updated'))
        .catch(err => console.error('Error updating steps:', err));
    }
  };

  const getStatusStyle = (status) => {
    switch(status) {
      case 'approved': return { color: '#28a745', fontWeight: 'bold' };
      case 'rejected': return { color: '#dc3545', fontWeight: 'bold' };
      case 'pending': return { color: '#ffc107', fontWeight: 'bold' };
      default: return { color: '#6c757d' };
    }
  };

  const handleRetryFetch = () => {
    fetchWorkflows();
  };

  return (
    <div style={styles.container}>
      {showPopup && (
        <div style={styles.popup}>
          {popupMsg}
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>🚀 Workflow Assistant</h1>
        <div style={styles.userInfo}>
          <span style={styles.userEmail}>{user?.email}</span>
          <button onClick={signOut} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.chatSection}>
          <div style={styles.chatHeader}>💬 Chat with Assistant</div>
          <div style={styles.chatMessages}>
            {messages.map((msg, i) => (
              <div key={i} style={msg.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong> {msg.content}
              </div>
            ))}
            {loading && <div style={styles.assistantMsg}>AI is thinking...</div>}
          </div>
          <div style={styles.chatInput}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask to create a workflow..."
              style={styles.input}
            />
            <button onClick={handleSend} style={styles.sendBtn}>Send</button>
          </div>
        </div>

        <div style={styles.workflowSection}>
          <div style={styles.workflowHeader}>
            📋 Workflow: {selectedWorkflow?.name || 'Select a workflow'}
            {selectedWorkflow && <span style={styles.versionBadge}>Version {selectedWorkflow.version}</span>}
            {!selectedWorkflow && (
              <button onClick={handleRetryFetch} style={styles.refreshBtn}>
                🔄 Refresh
              </button>
            )}
          </div>
          
          <div style={styles.workflowList}>
            {fetchError && (
              <div style={styles.errorContainer}>
                <p style={styles.errorText}>{fetchError}</p>
                <button onClick={handleRetryFetch} style={styles.retryBtn}>
                  Try Again
                </button>
              </div>
            )}
            
            {!fetchError && !selectedWorkflow && workflows.length === 0 && (
              <p style={styles.noWorkflows}>No workflows yet. Ask the assistant to create one!</p>
            )}
            
            {!fetchError && !selectedWorkflow && workflows.length > 0 && (
              <div style={styles.workflowGrid}>
                {workflows.map(w => (
                  <div 
                    key={w.id} 
                    style={styles.workflowCard}
                    onClick={() => setSelectedWorkflow(w)}
                  >
                    <div style={styles.cardHeader}>
                      <h3 style={styles.workflowName}>{w.name}</h3>
                      <span style={{...styles.statusBadge, ...getStatusStyle(w.status)}}>
                        {w.status}
                      </span>
                    </div>
                    <p style={styles.workflowDesc}>{w.description || 'No description'}</p>
                    <p style={styles.workflowMeta}>
                      Steps: {w.steps?.length || 0} | Version: {w.version || 1}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {selectedWorkflow && (
              <div style={styles.workflowDetail}>
                <div style={styles.detailHeader}>
                  <button 
                    onClick={() => setSelectedWorkflow(null)} 
                    style={styles.backBtn}
                  >
                    ← Back to list
                  </button>
                  <div style={styles.detailActions}>
                    <button onClick={() => handleSendToTeam(selectedWorkflow)} style={styles.teamBtn}>
                      📧 Submit for Approval
                    </button>
                    <button onClick={() => handleEdit(selectedWorkflow)} style={styles.editBtn}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(selectedWorkflow.id)} style={styles.deleteBtn}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={styles.statusContainer}>
                  <div style={styles.statusBadge}>
                    Status: <span style={getStatusStyle(selectedWorkflow.status)}>{selectedWorkflow.status}</span>
                  </div>
                  {selectedWorkflow.rejection_reason && (
                    <div style={styles.rejectionReason}>
                      Reason: {selectedWorkflow.rejection_reason}
                    </div>
                  )}
                </div>

                {selectedWorkflow.input_schema && (
                  <div style={styles.schemaSection}>
                    <h4 style={styles.sectionTitle}>Input Schema:</h4>
                    {Object.entries(selectedWorkflow.input_schema).map(([key, value]) => (
                      <div key={key} style={styles.schemaItem}>
                        - {key}: {value.type} {value.required ? '(required)' : '(optional)'}
                        {value.allowed_values && ` (${value.allowed_values.join('|')})`}
                      </div>
                    ))}
                  </div>
                )}

                {/* Steps Section with Debug */}
                <div style={styles.stepsSection}>
                  {/* Debug Info */}
                 

                  <div style={styles.stepsHeader}>
                    <h4 style={styles.sectionTitle}>Steps:</h4>
                    <div style={styles.addStepContainer}>
                      <input
                        type="text"
                        placeholder="Step name"
                        value={newStep.name}
                        onChange={(e) => setNewStep({...newStep, name: e.target.value})}
                        style={styles.stepNameInput}
                      />
                      <select
                        value={newStep.type}
                        onChange={(e) => setNewStep({...newStep, type: e.target.value})}
                        style={styles.stepTypeSelect}
                      >
                        <option value="approval">Approval</option>
                        <option value="notification">Notification</option>
                        <option value="task">Task</option>
                      </select>
                      <button onClick={handleAddStep} style={styles.addStepBtn}>
                        + Add
                      </button>
                    </div>
                  </div>
                  
                  {selectedWorkflow.steps?.map((step, index) => (
                    <div key={step.id} style={styles.stepItem}>
                      {editingStep?.id === step.id ? (
                        <div style={styles.stepEdit}>
                          <input
                            type="text"
                            value={editingStep.name}
                            onChange={(e) => setEditingStep({...editingStep, name: e.target.value})}
                            style={styles.stepInput}
                          />
                          <select
                            value={editingStep.type}
                            onChange={(e) => setEditingStep({...editingStep, type: e.target.value})}
                            style={styles.stepSelect}
                          >
                            <option value="approval">approval</option>
                            <option value="notification">notification</option>
                            <option value="task">task</option>
                          </select>
                          <button onClick={() => handleStepSave(editingStep)} style={styles.saveBtn}>Save</button>
                          <button onClick={() => setEditingStep(null)} style={styles.cancelBtn}>Cancel</button>
                        </div>
                      ) : (
                        <div style={styles.stepRow}>
                          <span style={styles.stepNumber}>{index + 1}.</span>
                          <span style={styles.stepName}>{step.name}</span>
                          <span style={styles.stepType}>({step.type})</span>
                          {/* Try multiple ways to get the assignee */}
                          {step.metadata?.assignee ? (
                            <span style={styles.stepAssignee}>→ {step.metadata.assignee}</span>
                          ) : step.assignee ? (
                            <span style={styles.stepAssignee}>→ {step.assignee}</span>
                          ) : step.email ? (
                            <span style={styles.stepAssignee}>→ {step.email}</span>
                          ) : step.metadata?.email ? (
                            <span style={styles.stepAssignee}>→ {step.metadata.email}</span>
                          ) : (
                            <span style={{color: '#999', fontSize: '12px'}}>(no assignee)</span>
                          )}
                          <div style={styles.stepActions}>
                            <button onClick={() => handleStepEdit(step)} style={styles.editSmallBtn}>[Edit]</button>
                            <button onClick={() => handleStepDelete(step.id)} style={styles.deleteSmallBtn}>[Delete]</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedWorkflow.rules && selectedWorkflow.rules.length > 0 && (
                  <div style={styles.rulesSection}>
                    <h4 style={styles.sectionTitle}>Rules:</h4>
                    <table style={styles.rulesTable}>
                      <thead>
                        <tr>
                          <th>Priority</th>
                          <th>Condition</th>
                          <th>Next Step</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWorkflow.rules.map(rule => (
                          <tr key={rule.id}>
                            <td>{rule.priority}</td>
                            <td>{rule.condition}</td>
                            <td>{rule.next_step}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.bgCircle1}></div>
      <div style={styles.bgCircle2}></div>
    </div>
  );
}

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    position: 'relative',
    overflow: 'auto'
  },
  popup: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#4caf50',
    color: 'white',
    padding: '15px 25px',
    borderRadius: '5px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    zIndex: 1000,
    animation: 'slideIn 0.3s'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    position: 'relative',
    zIndex: 10
  },
  title: {
    color: 'white',
    fontSize: '28px',
    margin: 0,
    textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },
  userEmail: {
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: '5px 10px',
    borderRadius: '20px',
    fontSize: '14px'
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid white',
    padding: '8px 16px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    height: 'calc(100vh - 120px)',
    position: 'relative',
    zIndex: 10
  },
  chatSection: {
    backgroundColor: 'white',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
  },
  chatHeader: {
    backgroundColor: '#f5f5f5',
    padding: '15px',
    fontWeight: 'bold',
    borderBottom: '1px solid #e0e0e0'
  },
  chatMessages: {
    flex: 1,
    padding: '15px',
    overflowY: 'auto',
    backgroundColor: '#fafafa'
  },
  userMsg: {
    backgroundColor: '#e3f2fd',
    padding: '10px',
    borderRadius: '10px',
    marginBottom: '10px',
    maxWidth: '80%',
    marginLeft: 'auto'
  },
  assistantMsg: {
    backgroundColor: '#f5f5f5',
    padding: '10px',
    borderRadius: '10px',
    marginBottom: '10px',
    maxWidth: '80%'
  },
  chatInput: {
    display: 'flex',
    padding: '15px',
    backgroundColor: 'white',
    borderTop: '1px solid #e0e0e0'
  },
  input: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    marginRight: '10px',
    fontSize: '14px'
  },
  sendBtn: {
    padding: '10px 20px',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
  },
  refreshBtn: {
    padding: '5px 10px',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  errorContainer: {
    textAlign: 'center',
    padding: '40px 20px',
    backgroundColor: '#fff3f3',
    borderRadius: '5px',
    margin: '20px 0'
  },
  errorText: {
    color: '#dc3545',
    marginBottom: '15px',
    fontSize: '14px'
  },
  retryBtn: {
    padding: '8px 16px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  workflowSection: {
    backgroundColor: 'white',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 5px 20px rgba(0,0,0,0.2)'
  },
  workflowHeader: {
    backgroundColor: '#f5f5f5',
    padding: '15px',
    fontWeight: 'bold',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  versionBadge: {
    backgroundColor: '#667eea',
    color: 'white',
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '12px'
  },
  workflowList: {
    flex: 1,
    padding: '15px',
    overflowY: 'auto',
    backgroundColor: '#fafafa'
  },
  noWorkflows: {
    textAlign: 'center',
    color: '#999',
    marginTop: '50px'
  },
  workflowGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  workflowCard: {
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '5px',
    padding: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '5px'
  },
  workflowName: {
    margin: 0,
    color: '#333',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  statusBadge: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    backgroundColor: '#f0f0f0'
  },
  workflowDesc: {
    margin: '5px 0',
    color: '#666',
    fontSize: '14px'
  },
  workflowMeta: {
    margin: 0,
    color: '#999',
    fontSize: '12px'
  },
  workflowDetail: {
    padding: '10px'
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '10px'
  },
  backBtn: {
    padding: '5px 10px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  detailActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  editBtn: {
    padding: '5px 10px',
    backgroundColor: '#ffc107',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  deleteBtn: {
    padding: '5px 10px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  teamBtn: {
    padding: '5px 10px',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  editSmallBtn: {
    backgroundColor: 'transparent',
    color: '#ffc107',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px'
  },
  deleteSmallBtn: {
    backgroundColor: 'transparent',
    color: '#dc3545',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px'
  },
  statusContainer: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    flexWrap: 'wrap'
  },
  rejectionReason: {
    color: '#dc3545',
    fontSize: '14px',
    fontStyle: 'italic'
  },
  schemaSection: {
    marginBottom: '20px',
    padding: '10px',
    backgroundColor: '#f5f5f5',
    borderRadius: '5px'
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    color: '#333',
    fontSize: '16px'
  },
  schemaItem: {
    margin: '5px 0',
    color: '#555',
    fontSize: '14px'
  },
  stepsSection: {
    marginBottom: '20px'
  },
  stepsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    flexWrap: 'wrap',
    gap: '10px'
  },
  addStepContainer: {
    display: 'flex',
    gap: '5px',
    alignItems: 'center'
  },
  stepNameInput: {
    padding: '5px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontSize: '12px',
    width: '150px'
  },
  stepTypeSelect: {
    padding: '5px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontSize: '12px'
  },
  addStepBtn: {
    padding: '5px 10px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  stepItem: {
    marginBottom: '8px'
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px',
    backgroundColor: 'white',
    borderRadius: '3px',
    flexWrap: 'wrap'
  },
  stepNumber: {
    color: '#999',
    fontSize: '14px'
  },
  stepName: {
    color: '#333',
    fontSize: '14px',
    fontWeight: '500'
  },
  stepType: {
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic'
  },
  stepAssignee: {
    color: '#17a2b8',
    fontSize: '12px',
    backgroundColor: '#e8f4f8',
    padding: '2px 6px',
    borderRadius: '3px'
  },
  stepActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: '8px'
  },
  stepEdit: {
    display: 'flex',
    gap: '8px',
    padding: '5px',
    flexWrap: 'wrap'
  },
  stepInput: {
    padding: '3px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontSize: '14px'
  },
  stepSelect: {
    padding: '3px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontSize: '14px'
  },
  saveBtn: {
    padding: '3px 8px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  cancelBtn: {
    padding: '3px 8px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  rulesSection: {
    marginTop: '20px'
  },
  rulesTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  bgCircle1: {
    position: 'fixed',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    top: '-200px',
    right: '-200px',
    zIndex: 0
  },
  bgCircle2: {
    position: 'fixed',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)',
    bottom: '-150px',
    left: '-150px',
    zIndex: 0
  }
};

export default Dashboard;