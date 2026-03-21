#!/usr/bin/env python3
"""
Main entry point for running the Workflow Assistant with all three tools
"""

import os
import sys
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import TOOLS_PATH
from backend.services.workflow_tools import workflow_tools_service
from backend.services.retriever import retriever_service
from backend.services.vector_store import vector_store_service
from backend.services.app import main, assistant

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="Workflow Assistant API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002"],  # Your React frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/")
async def root():
    return {"message": "Workflow Assistant API", "status": "running"}

@app.get("/workflows")
async def get_workflows():
    """Get all workflows"""
    # This should call your service to get workflows
    return {"workflows": []}

@app.post("/api/chat")
async def chat(message: dict):
    """Chat with assistant"""
    query = message.get("message", "")
    result = assistant.process_query(query)
    return result

@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow"""
    # Add your delete logic here
    return {"message": f"Workflow {workflow_id} deleted"}

@app.put("/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, workflow: dict):
    """Update a workflow"""
    # Add your update logic here
    return {"message": f"Workflow {workflow_id} updated", "workflow": workflow}

def verify_tools_exist():
    """Verify that all three required tools exist"""
    required_tools = [
        "expense_approval.json",
        "employee_onboarding.json",
        "invoice_processing.json"
    ]

    print("\n" + "=" * 60)
    print("VERIFYING TOOLS")
    print("=" * 60)

    missing_tools = []
    for tool in required_tools:
        tool_path = os.path.join(TOOLS_PATH, tool)
        if os.path.exists(tool_path):
            size = os.path.getsize(tool_path)
            print(f" Found {tool} ({size} bytes)")
        else:
            print(f" Missing {tool}")
            missing_tools.append(tool)

    return missing_tools


def initialize_tools():
    """Initialize and load all workflow tools"""
    print("\n" + "=" * 60)
    print(" INITIALIZING WORKFLOW ASSISTANT")
    print("=" * 60)

    if not os.path.exists(TOOLS_PATH):
        print(f" Creating tools directory: {TOOLS_PATH}")
        os.makedirs(TOOLS_PATH, exist_ok=True)

    missing = verify_tools_exist()
    if missing:
        print(f"\n Missing tools: {', '.join(missing)}")

    tool_files = list(Path(TOOLS_PATH).glob("*.json"))
    print(f"\n Found {len(tool_files)} tool files:")
    for tool_file in tool_files:
        print(f"   - {tool_file.name}")

    print("\n Loading tools into vector stores...")
    loaded_tools = workflow_tools_service.load_all_tools()

    print(f"\n Successfully loaded {len(loaded_tools)} tools:")

    for tool_name, tool_info in loaded_tools.items():
        print(f"   - {tool_name}: {tool_info['document_count']} documents")

        # ✅ FIXED HERE
        docs = vector_store_service.get_all_documents(tool_name)

        types = {}
        for doc in docs:
            doc_type = doc.metadata.get('type', 'unknown')
            types[doc_type] = types.get(doc_type, 0) + 1

        if types:
            print(f"     Types: {types}")

    return loaded_tools


def test_invoice_queries():
    """Test invoice-related queries"""
    print("\n" + "=" * 60)
    print(" TESTING INVOICE PROCESSING")
    print("=" * 60)

    test_queries = [
        "How do I process an invoice that doesn't match the purchase order?",
        "What happens when an invoice is over $10,000?",
        "How are urgent payments handled?",
        "What causes OCR to fail?",
        "Show invoice approval workflow"
    ]

    for i, query in enumerate(test_queries, 1):
        print(f"\n Test {i}: {query}")

        suggestions = retriever_service.get_tool_suggestions(query)
        print(f"   Tools: {[s['tool_name'] for s in suggestions[:3]]}")

        docs = retriever_service.retrieve_workflow_info(query)
        print(f"   Retrieved: {len(docs)} docs")

        if docs:
            top = docs[0]
            print(f"   Top: {top.page_content[:120]}...")


def interactive_mode():
    """Chat mode"""
    print("\n" + "=" * 60)
    print(" INTERACTIVE MODE")
    print("=" * 60)

    while True:
        query = input("\n You: ").strip()

        if query.lower() == "exit":
            print("👋 Bye!")
            break

        elif query.lower() == "tools":
            tools = workflow_tools_service.list_tools()
            for tool in tools:
                print(f" - {tool['name']} ({tool.get('document_count', 0)})")

        elif query.lower() == "stats":
            print("\n Stats:")

            # ✅ FIXED HERE
            for tool_name in vector_store_service.vector_stores.keys():
                docs = vector_store_service.get_all_documents(tool_name)
                print(f"  - {tool_name}: {len(docs)} docs")

        elif query.lower() == "test":
            test_invoice_queries()

        else:
            print(" Processing...")
            result = assistant.process_query(query)

            print(f"\n {result['response']}")

            if result.get("suggested_tools"):
                print("\n💡 Suggestions:")
                for tool in result["suggested_tools"][:3]:
                    print(f" - {tool['tool_name']}")


def main():
    print("\n WORKFLOW ASSISTANT")
    print("=" * 60)

    loaded_tools = initialize_tools()

    if loaded_tools:
        test_invoice_queries()
        # Start the FastAPI server
        print("\n Starting API server on http://localhost:8000")
        uvicorn.run(app, host="0.0.0.0", port=8000)
    else:
        print(" No tools loaded")
        interactive_mode()  # Fallback to CLI mode


if __name__ == "__main__":
    main()