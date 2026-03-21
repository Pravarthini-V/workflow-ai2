import os
import logging
from typing import Dict, Any
from langgraph.graph import StateGraph, END
from typing import TypedDict, List
from backend.services.workflow_tools import workflow_tools_service
from backend.services.retriever import retriever_service
from backend.config import GROQ_MODEL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define state schema
class WorkflowState(TypedDict):
    messages: List[Dict[str, str]]
    query: str
    tool_selected: str
    retrieved_context: str
    response: str
    suggested_tools: List[Dict[str, Any]]

class WorkflowAssistant:
    """Main workflow assistant using LangGraph"""
    
    def __init__(self):
        # Initialize services
        self.workflow_tools = workflow_tools_service
        
        # Load all tools on startup
        self.workflow_tools.load_all_tools()
        
        # Build the graph
        self.graph = self._build_graph()
    
    def _build_graph(self):
        """Build the LangGraph workflow"""
        workflow = StateGraph(WorkflowState)
        
        # Add nodes
        workflow.add_node("classify_query", self.classify_query)
        workflow.add_node("retrieve_info", self.retrieve_info)
        workflow.add_node("generate_response", self.generate_response)
        
        # Add edges
        workflow.set_entry_point("classify_query")
        workflow.add_edge("classify_query", "retrieve_info")
        workflow.add_edge("retrieve_info", "generate_response")
        workflow.add_edge("generate_response", END)
        
        return workflow.compile()
    
    def classify_query(self, state: WorkflowState) -> WorkflowState:
        """Classify the query to determine which tool to use"""
        query = state["query"]
        
        # Simple classification based on keywords
        query_lower = query.lower()
        
        if any(word in query_lower for word in ["expense", "reimbursement", "money", "cost"]):
            tool = "expense_approval"
        elif any(word in query_lower for word in ["onboard", "hire", "employee", "new joiner"]):
            tool = "employee_onboarding"
        elif any(word in query_lower for word in ["invoice", "vendor", "bill", "payment"]):
            tool = "invoice_processing"
        else:
            tool = None
        
        # Get tool suggestions
        suggestions = retriever_service.get_tool_suggestions(query)
        
        state["tool_selected"] = tool
        state["suggested_tools"] = suggestions
        
        logger.info(f"✅ Classified query - Tool: {tool}, Suggestions: {len(suggestions)}")
        return state
    
    def retrieve_info(self, state: WorkflowState) -> WorkflowState:
        """Retrieve relevant information based on query and tool selection"""
        query = state["query"]
        tool = state["tool_selected"]
        
        # Process query through workflow tools service
        result = self.workflow_tools.process_query(query, tool)
        
        state["retrieved_context"] = result["context"]
        state["messages"].append({
            "role": "system",
            "content": f"Retrieved {result['documents_retrieved']} documents"
        })
        
        logger.info(f"✅ Retrieved {result['documents_retrieved']} documents")
        return state
    
    def generate_response(self, state: WorkflowState) -> WorkflowState:
        """Generate final response using retrieved context"""
        query = state["query"]
        context = state["retrieved_context"]
        tool = state["tool_selected"]
        suggestions = state["suggested_tools"]
        
        # Build prompt
        prompt = f"""You are a workflow assistant helping users with business processes.

Query: {query}

Relevant Workflow Information:
{context}

Based on the retrieved workflow information above, provide a helpful response.
If no specific tool was selected but there are suggestions, mention them.
If the information is insufficient, ask for clarification.

Response:"""
        
        # Here you would call your LLM (Groq, OpenAI, etc.)
        # For now, we'll simulate a response
        response = self._simulate_llm_response(prompt, tool, suggestions)
        
        state["response"] = response
        state["messages"].append({
            "role": "assistant",
            "content": response
        })
        
        logger.info("✅ Generated response")
        return state
    
    def _simulate_llm_response(self, prompt: str, tool: str, suggestions: List) -> str:
        """Simulate LLM response (replace with actual LLM call)"""
        if tool:
            return f"I found information about the {tool} workflow. Based on your query, here are the relevant steps and rules. Would you like me to explain any specific part in detail?"
        elif suggestions:
            tools = [s["tool_name"] for s in suggestions[:2]]
            return f"I found several relevant workflows that might help: {', '.join(tools)}. Could you provide more details about which one you're interested in?"
        else:
            return "I couldn't find specific workflow information matching your query. Could you provide more details about what you're looking for?"
    
    def process_query(self, query: str) -> Dict[str, Any]:
        """Process a user query through the workflow"""
        initial_state = {
            "messages": [{"role": "user", "content": query}],
            "query": query,
            "tool_selected": None,
            "retrieved_context": "",
            "response": "",
            "suggested_tools": []
        }
        
        # Run the graph
        final_state = self.graph.invoke(initial_state)
        
        return {
            "query": query,
            "response": final_state["response"],
            "tool_used": final_state["tool_selected"],
            "suggested_tools": final_state["suggested_tools"],
            "context_used": final_state["retrieved_context"][:500] + "..."  # Truncate for display
        }

# Create global assistant instance
assistant = WorkflowAssistant()

def main():
    """Main function to run the assistant"""
    print("\n" + "="*60)
    print("🤖 WORKFLOW ASSISTANT - Chat Interface")
    print("="*60)
    print("\nCommands:")
    print("  - Type your question about workflows")
    print("  - Type 'tools' to list available tools")
    print("  - Type 'exit' to quit")
    print("-"*60)
    
    while True:
        query = input("\n📝 You: ").strip()
        
        if query.lower() == 'exit':
            print("\n👋 Goodbye!")
            break
        elif query.lower() == 'tools':
            tools = workflow_tools_service.list_tools()
            print("\n🔧 Available Tools:")
            for tool in tools:
                status = "✅" if tool["status"] == "loaded" else "📁"
                count = tool.get("document_count", 0)
                print(f"  {status} {tool['name']} ({count} documents)")
            continue
        
        if not query:
            continue
        
        print("\n⏳ Processing...")
        
        # Process query
        result = assistant.process_query(query)
        
        print(f"\n🤖 Assistant: {result['response']}")
        
        if result['suggested_tools']:
            print("\n💡 Suggested tools:")
            for tool in result['suggested_tools'][:3]:
                print(f"  - {tool['tool_name']} (relevance: {tool['relevance_score']:.2f})")

if __name__ == "__main__":
    main()