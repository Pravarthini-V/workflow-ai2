import os
import json
import logging
from typing import List, Optional
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.config import CHUNK_SIZE, CHUNK_OVERLAP
from backend.services.embeddings import embedding_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DocumentLoaderService:
    """Service for loading and processing documents"""
    
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ".", "!", "?", ",", " ", ""]
        )
        logger.info(f"✅ DocumentLoader initialized with chunk_size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP}")
    
    def load_workflow_tool(self, file_path: str, tool_name: str) -> List[Document]:
        """
        Load a workflow tool JSON file and convert to documents
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            documents = []
            
            # Process workflow embeddings
            if "workflow_embeddings" in data:
                for workflow in data["workflow_embeddings"]:
                    # Create main workflow document
                    workflow_text = f"""
WORKFLOW: {workflow['workflow_name']}
ID: {workflow['workflow_id']}
VERSION: {workflow['workflow_version']}
DESCRIPTION: {workflow['embedding_text']}
TAGS: {', '.join(workflow['embedding_metadata'].get('tags', []))}
STEP TYPES: {', '.join(workflow['embedding_metadata'].get('step_types', []))}
KEY ENTITIES: {', '.join(workflow['embedding_metadata'].get('key_entities', []))}
AVG PROCESSING TIME: {workflow['embedding_metadata'].get('avg_processing_time', 'N/A')}
                    """
                    
                    doc = Document(
                        page_content=workflow_text.strip(),
                        metadata={
                            "tool_name": tool_name,
                            "type": "workflow",
                            "workflow_id": workflow["workflow_id"],
                            "workflow_name": workflow["workflow_name"],
                            "tags": workflow['embedding_metadata'].get('tags', []),
                            "version": workflow["workflow_version"]
                        }
                    )
                    documents.append(doc)
            
            # Process step embeddings
            if "step_embeddings" in data:
                for step in data["step_embeddings"]:
                    step_text = f"""
STEP: {step['step_name']}
TYPE: {step['step_type']}
WORKFLOW: {step['workflow_id']}
DESCRIPTION: {step['embedding_text']}
                    """
                    
                    doc = Document(
                        page_content=step_text.strip(),
                        metadata={
                            "tool_name": tool_name,
                            "type": "step",
                            "step_id": step["step_id"],
                            "step_name": step["step_name"],
                            "workflow_id": step["workflow_id"],
                            "step_type": step["step_type"]
                        }
                    )
                    documents.append(doc)
            
            # Process rule embeddings
            if "rule_embeddings" in data:
                for rule in data["rule_embeddings"]:
                    rule_text = f"""
RULE CONDITION: {rule['rule_condition']}
DESCRIPTION: {rule['embedding_text']}
WORKFLOW: {rule['workflow_id']}
PRIORITY: {rule['embedding_metadata'].get('priority', 'N/A')}
PATTERN: {rule['embedding_metadata'].get('condition_pattern', 'N/A')}
                    """
                    
                    doc = Document(
                        page_content=rule_text.strip(),
                        metadata={
                            "tool_name": tool_name,
                            "type": "rule",
                            "rule_id": rule["rule_id"],
                            "step_id": rule["step_id"],
                            "workflow_id": rule["workflow_id"],
                            "priority": rule['embedding_metadata'].get('priority', 999)
                        }
                    )
                    documents.append(doc)
            
            # Process execution embeddings (historical data)
            if "execution_embeddings" in data:
                for execution in data["execution_embeddings"]:
                    exec_text = f"""
EXECUTION ID: {execution['execution_id']}
WORKFLOW: {execution['workflow_name']}
STATUS: {execution['embedding_metadata'].get('status', 'unknown')}
DESCRIPTION: {execution['embedding_text']}
OUTCOME: {execution['embedding_metadata'].get('outcome', 'N/A')}
                    """
                    
                    doc = Document(
                        page_content=exec_text.strip(),
                        metadata={
                            "tool_name": tool_name,
                            "type": "execution",
                            "execution_id": execution["execution_id"],
                            "workflow_id": execution["workflow_id"],
                            "workflow_name": execution["workflow_name"],
                            "status": execution['embedding_metadata'].get('status', 'unknown')
                        }
                    )
                    documents.append(doc)
            
            # Split long documents
            split_docs = []
            for doc in documents:
                if len(doc.page_content) > CHUNK_SIZE:
                    chunks = self.text_splitter.split_text(doc.page_content)
                    for i, chunk in enumerate(chunks):
                        split_docs.append(Document(
                            page_content=chunk,
                            metadata={**doc.metadata, "chunk": i, "chunk_count": len(chunks)}
                        ))
                else:
                    split_docs.append(doc)
            
            logger.info(f"✅ Loaded {len(split_docs)} documents from tool: {tool_name}")
            return split_docs
            
        except Exception as e:
            logger.error(f"❌ Error loading workflow tool {tool_name}: {str(e)}")
            return []
    
    def load_all_workflow_tools(self, tools_dir: str) -> dict:
        """Load all workflow tools from directory"""
        all_documents = {}
        
        if not os.path.exists(tools_dir):
            logger.warning(f"⚠️ Tools directory not found: {tools_dir}")
            return all_documents
        
        for filename in os.listdir(tools_dir):
            if filename.endswith('.json'):
                tool_name = filename.replace('.json', '')
                file_path = os.path.join(tools_dir, filename)
                documents = self.load_workflow_tool(file_path, tool_name)
                if documents:
                    all_documents[tool_name] = documents
                    logger.info(f"  → {tool_name}: {len(documents)} documents")
        
        logger.info(f"✅ Loaded {len(all_documents)} workflow tools total")
        return all_documents
    
    def load_text_file(self, file_path: str, tool_name: str) -> List[Document]:
        """Load a text file and split into documents"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
            
            # Split text into chunks
            chunks = self.text_splitter.split_text(text)
            
            documents = []
            for i, chunk in enumerate(chunks):
                doc = Document(
                    page_content=chunk,
                    metadata={
                        "tool_name": tool_name,
                        "type": "text",
                        "chunk": i,
                        "source": os.path.basename(file_path)
                    }
                )
                documents.append(doc)
            
            logger.info(f"✅ Loaded {len(documents)} chunks from text file: {os.path.basename(file_path)}")
            return documents
            
        except Exception as e:
            logger.error(f"❌ Error loading text file {file_path}: {str(e)}")
            return []

# Global instance
document_loader = DocumentLoaderService()