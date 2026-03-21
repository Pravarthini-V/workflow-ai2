import os
import json
import logging
from typing import List, Dict, Any, Optional
from backend.config import TOOLS_PATH
from backend.services.document_loader import document_loader
from backend.services.vector_store import vector_store_service
from backend.services.retriever import retriever_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WorkflowToolsService:
    """Service for managing workflow tools"""
    
    def __init__(self):
        self.tools_path = TOOLS_PATH
        self.loaded_tools = {}
    
    def load_all_tools(self):
        """Load all workflow tools into vector stores"""
        all_documents = document_loader.load_all_workflow_tools(self.tools_path)
        
        for tool_name, documents in all_documents.items():
            vector_store_service.add_documents(tool_name, documents)
            self.loaded_tools[tool_name] = {
                "name": tool_name,
                "document_count": len(documents),
                "status": "loaded"
            }
        
        logger.info(f"✅ Loaded {len(self.loaded_tools)} tools into vector stores")
        return self.loaded_tools
    
    def create_tool_from_json(self, tool_name: str, json_data: Dict[str, Any]):
        """Create a new tool from JSON data"""
        file_path = os.path.join(self.tools_path, f"{tool_name}.json")
        
        # Save JSON to file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2)
        
        # Load into vector store
        documents = document_loader.load_workflow_tool(file_path, tool_name)
        vector_store_service.add_documents(tool_name, documents)
        
        self.loaded_tools[tool_name] = {
            "name": tool_name,
            "document_count": len(documents),
            "status": "loaded"
        }
        
        logger.info(f"✅ Created and loaded new tool: {tool_name}")
        return self.loaded_tools[tool_name]
    
    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific tool"""
        if tool_name in self.loaded_tools:
            return self.loaded_tools[tool_name]
        
        # Check if tool exists but not loaded
        file_path = os.path.join(self.tools_path, f"{tool_name}.json")
        if os.path.exists(file_path):
            return {
                "name": tool_name,
                "status": "not_loaded",
                "file_exists": True
            }
        
        return None
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """List all available tools"""
        tools = []
        
        # Get loaded tools
        for tool_name, info in self.loaded_tools.items():
            tools.append(info)
        
        # Check for unloaded tools
        for filename in os.listdir(self.tools_path):
            if filename.endswith('.json'):
                tool_name = filename.replace('.json', '')
                if tool_name not in self.loaded_tools:
                    tools.append({
                        "name": tool_name,
                        "status": "not_loaded",
                        "file_exists": True
                    })
        
        return tools
    
    def process_query(self, query: str, tool_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Process a query against workflow tools
        """
        # Get relevant documents
        if tool_name and tool_name in self.loaded_tools:
            documents = retriever_service.retrieve_workflow_info(query, tool_name)
            suggested_tools = []
        else:
            documents = retriever_service.retrieve_workflow_info(query)
            suggested_tools = retriever_service.get_tool_suggestions(query)
        
        # Format context
        context = retriever_service.format_retrieved_context(documents)
        
        return {
            "query": query,
            "tool_used": tool_name or "all",
            "documents_retrieved": len(documents),
            "context": context,
            "suggested_tools": suggested_tools[:3] if suggested_tools else [],
            "documents": [
                {
                    "content": doc.page_content[:200] + "...",
                    "metadata": doc.metadata
                }
                for doc in documents[:3]  # Return first 3 for preview
            ]
        }

# Global instance
workflow_tools_service = WorkflowToolsService()