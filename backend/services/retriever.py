import logging
from typing import List, Dict, Any, Optional
from langchain_core.documents import Document
from backend.config import MMR_K, MMR_FETCH_K, MMR_LAMBDA
from backend.services.vector_store import vector_store_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RetrieverService:
    """Service for retrieving relevant documents using MMR search"""
    
    def __init__(self):
        self.default_k = MMR_K
        self.default_fetch_k = MMR_FETCH_K
        self.default_lambda = MMR_LAMBDA
        logger.info(f"✅ RetrieverService initialized with MMR_K={MMR_K}, MMR_FETCH_K={MMR_FETCH_K}")
    
    def retrieve_workflow_info(self, query: str, tool_name: str = None, k: int = None) -> List[Document]:
        """
        Retrieve relevant workflow information based on query using MMR search
        
        Args:
            query: User query string
            tool_name: Specific tool to search (None for all tools)
            k: Number of results to return (overrides default)
        
        Returns:
            List of relevant documents
        """
        k = k or self.default_k
        
        if tool_name:
            # Search specific tool
            try:
                results = vector_store_service.mmr_search(
                    tool_name, 
                    query, 
                    k=k,
                    fetch_k=self.default_fetch_k,
                    lambda_mult=self.default_lambda
                )
                logger.info(f"✅ Retrieved {len(results)} documents from {tool_name}")
                
                # Log relevance scores (simulated)
                for i, doc in enumerate(results):
                    logger.debug(f"  Result {i+1}: {doc.metadata.get('type', 'unknown')} - {doc.page_content[:50]}...")
                
                return results
            except Exception as e:
                logger.error(f"❌ Error searching tool {tool_name}: {str(e)}")
                return []
        else:
            # Search all tools and combine results
            all_results = []
            tool_results = {}
            
            for tool_name in vector_store_service.vector_stores.keys():
                try:
                    results = vector_store_service.mmr_search(
                        tool_name, 
                        query, 
                        k=max(2, k // 2),  # At least 2 from each tool
                        fetch_k=self.default_fetch_k,
                        lambda_mult=self.default_lambda
                    )
                    if results:
                        all_results.extend(results)
                        tool_results[tool_name] = len(results)
                except Exception as e:
                    logger.error(f"❌ Error searching tool {tool_name}: {str(e)}")
                    continue
            
            # Limit total results to k
            all_results = all_results[:k]
            
            logger.info(f"✅ Retrieved {len(all_results)} documents from {len(tool_results)} tools")
            for tool, count in tool_results.items():
                logger.info(f"   - {tool}: {count} documents")
            
            return all_results
    
    def retrieve_by_type(self, query: str, doc_type: str, tool_name: str = None) -> List[Document]:
        """
        Retrieve documents of a specific type (workflow, step, rule, execution)
        """
        all_results = self.retrieve_workflow_info(query, tool_name, k=self.default_fetch_k)
        
        # Filter by type
        filtered = [doc for doc in all_results if doc.metadata.get('type') == doc_type]
        
        logger.info(f"✅ Retrieved {len(filtered)} {doc_type} documents")
        return filtered[:self.default_k]
    
    def retrieve_rules_for_condition(self, condition_keywords: List[str], tool_name: str = None) -> List[Document]:
        """
        Retrieve rules that match specific condition keywords
        """
        query = " ".join(condition_keywords)
        return self.retrieve_by_type(query, "rule", tool_name)
    
    def retrieve_workflows_by_tag(self, tags: List[str], tool_name: str = None) -> List[Document]:
        """
        Retrieve workflows with specific tags
        """
        query = f"workflow with tags: {', '.join(tags)}"
        workflows = self.retrieve_by_type(query, "workflow", tool_name)
        
        # Additional metadata filtering
        filtered = []
        for doc in workflows:
            doc_tags = doc.metadata.get('tags', [])
            if any(tag in doc_tags for tag in tags):
                filtered.append(doc)
        
        return filtered
    
    def format_retrieved_context(self, documents: List[Document]) -> str:
        """Format retrieved documents into context string for LLM"""
        if not documents:
            return "No relevant workflow information found."
        
        context_parts = []
        context_parts.append("RELEVANT WORKFLOW INFORMATION:")
        context_parts.append("=" * 50)
        
        for i, doc in enumerate(documents, 1):
            tool_name = doc.metadata.get("tool_name", "unknown")
            doc_type = doc.metadata.get("type", "unknown").upper()
            workflow_name = doc.metadata.get("workflow_name", "")
            
            # Header with metadata
            header = f"\n[{i}] {doc_type}"
            if workflow_name:
                header += f" - {workflow_name}"
            header += f" (from: {tool_name})"
            
            context_parts.append(header)
            context_parts.append("-" * 40)
            context_parts.append(doc.page_content.strip())
            
            # Add key metadata if available
            if doc_type.lower() == "rule":
                priority = doc.metadata.get('priority', 'N/A')
                context_parts.append(f"   Priority: {priority}")
            elif doc_type.lower() == "step":
                step_type = doc.metadata.get('step_type', 'N/A')
                context_parts.append(f"   Step Type: {step_type}")
            
            context_parts.append("")  # Empty line between documents
        
        return "\n".join(context_parts)
    
    def get_tool_suggestions(self, query: str) -> List[Dict[str, Any]]:
        """
        Suggest which tools might be relevant for the query based on initial similarity
        """
        suggestions = []
        
        for tool_name in vector_store_service.vector_stores.keys():
            try:
                # Quick similarity search to check relevance
                results = vector_store_service.similarity_search(tool_name, query, k=3)
                
                if results:
                    # Calculate a simple relevance score based on content matches
                    score = 0
                    matched_keywords = []
                    
                    # Simple keyword matching for scoring
                    query_words = set(query.lower().split())
                    for doc in results:
                        doc_words = set(doc.page_content.lower().split())
                        matches = query_words.intersection(doc_words)
                        score += len(matches)
                        matched_keywords.extend(list(matches)[:3])
                    
                    suggestions.append({
                        "tool_name": tool_name,
                        "relevance_score": min(1.0, score / 10),  # Normalize to 0-1
                        "matched_keywords": list(set(matched_keywords))[:5],
                        "sample_results": [doc.page_content[:150] + "..." for doc in results[:2]]
                    })
            except Exception as e:
                logger.error(f"Error getting suggestions for {tool_name}: {str(e)}")
                continue
        
        # Sort by relevance score
        suggestions.sort(key=lambda x: x["relevance_score"], reverse=True)
        return suggestions
    
    def hybrid_search(self, query: str, tool_name: str = None, 
                     keyword_weight: float = 0.3, semantic_weight: float = 0.7) -> List[Document]:
        """
        Hybrid search combining keyword matching and semantic search
        """
        # Get semantic results
        semantic_results = self.retrieve_workflow_info(query, tool_name, k=self.default_fetch_k)
        
        # Get keyword matches (simple implementation)
        keyword_results = []
        query_words = set(query.lower().split())
        
        all_docs = vector_store_service.get_all_documents(tool_name) if tool_name else []
        if not tool_name:
            # Get all documents from all tools
            for tool in vector_store_service.vector_stores.keys():
                all_docs.extend(vector_store_service.get_all_documents(tool))
        
        # Score documents by keyword match
        for doc in all_docs:
            doc_words = set(doc.page_content.lower().split())
            matches = query_words.intersection(doc_words)
            if matches:
                keyword_results.append((doc, len(matches)))
        
        # Sort by keyword matches
        keyword_results.sort(key=lambda x: x[1], reverse=True)
        keyword_results = [doc for doc, _ in keyword_results[:self.default_k]]
        
        # Combine results (simple interleaving)
        combined = []
        seen_ids = set()
        
        # Add from semantic results first
        for doc in semantic_results:
            doc_id = doc.metadata.get('id', doc.page_content[:50])
            if doc_id not in seen_ids:
                combined.append(doc)
                seen_ids.add(doc_id)
        
        # Add from keyword results
        for doc in keyword_results:
            doc_id = doc.metadata.get('id', doc.page_content[:50])
            if doc_id not in seen_ids and len(combined) < self.default_k:
                combined.append(doc)
                seen_ids.add(doc_id)
        
        logger.info(f"✅ Hybrid search returned {len(combined)} documents")
        return combined[:self.default_k]

# Global instance
retriever_service = RetrieverService()