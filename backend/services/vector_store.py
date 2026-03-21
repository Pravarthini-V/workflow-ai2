import os
import logging
from typing import List, Dict
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from backend.config import CHROMA_PERSIST_DIR
from backend.services.embeddings import embedding_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VectorStoreService:
    """Service for managing vector stores for different tools"""

    def __init__(self):
        self.embedding_function = embedding_service.get_embeddings()
        self.vector_stores: Dict[str, Chroma] = {}
        self.documents_cache: Dict[str, List[Document]] = {}

        os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)

    # -------------------------------
    # CREATE / GET VECTOR STORE
    # -------------------------------
    def get_vector_store(self, tool_name: str) -> Chroma:
        """Get or create vector store for a tool"""
        if tool_name not in self.vector_stores:
            persist_dir = os.path.join(CHROMA_PERSIST_DIR, tool_name)
            os.makedirs(persist_dir, exist_ok=True)

            self.vector_stores[tool_name] = Chroma(
                collection_name=tool_name,
                embedding_function=self.embedding_function,
                persist_directory=persist_dir
            )

            logger.info(f"✅ Created vector store for tool: {tool_name}")

        return self.vector_stores[tool_name]

    # -------------------------------
    # ADD DOCUMENTS
    # -------------------------------
    def add_documents(self, tool_name: str, documents: List[Document]):
        """Add documents to tool's vector store"""
        if not documents:
            logger.warning(f"⚠️ No documents to add for tool: {tool_name}")
            return

        vector_store = self.get_vector_store(tool_name)

        vector_store.add_documents(documents)
        vector_store.persist()

        # Cache update
        if tool_name not in self.documents_cache:
            self.documents_cache[tool_name] = []

        self.documents_cache[tool_name].extend(documents)

        logger.info(f"✅ Added {len(documents)} documents to {tool_name}")

    # -------------------------------
    # SIMILARITY SEARCH
    # -------------------------------
    def similarity_search(self, tool_name: str, query: str, k: int = 5) -> List[Document]:
        vector_store = self.get_vector_store(tool_name)
        return vector_store.similarity_search(query, k=k)

    # -------------------------------
    # MMR SEARCH
    # -------------------------------
    def mmr_search(self, tool_name: str, query: str, k: int = 5, fetch_k: int = 20, lambda_mult: float = 0.7) -> List[Document]:
        vector_store = self.get_vector_store(tool_name)

        return vector_store.max_marginal_relevance_search(
            query,
            k=k,
            fetch_k=fetch_k,
            lambda_mult=lambda_mult
        )

    # -------------------------------
    # GET ALL DOCUMENTS (FIXED 🔥)
    # -------------------------------
    def get_all_documents(self, tool_name: str) -> List[Document]:
        """Return all documents (cache + persistent fallback)"""

        # ✅ 1. Return from cache if exists
        if tool_name in self.documents_cache:
            return self.documents_cache[tool_name]

        # ✅ 2. Otherwise load from Chroma DB
        try:
            vector_store = self.get_vector_store(tool_name)
            data = vector_store.get()

            docs = []
            for i in range(len(data.get("documents", []))):
                docs.append(Document(
                    page_content=data["documents"][i],
                    metadata=data["metadatas"][i] if data.get("metadatas") else {}
                ))

            # Cache it for future
            self.documents_cache[tool_name] = docs

            logger.info(f"📦 Loaded {len(docs)} documents from DB for {tool_name}")

            return docs

        except Exception as e:
            logger.error(f"❌ Error fetching documents for {tool_name}: {e}")
            return []

    # -------------------------------
    # DELETE STORE
    # -------------------------------
    def delete_vector_store(self, tool_name: str):
        """Delete vector store for a tool"""

        if tool_name in self.vector_stores:
            del self.vector_stores[tool_name]

        if tool_name in self.documents_cache:
            del self.documents_cache[tool_name]

        persist_dir = os.path.join(CHROMA_PERSIST_DIR, tool_name)

        if os.path.exists(persist_dir):
            import shutil
            shutil.rmtree(persist_dir)

        logger.info(f"🗑️ Deleted vector store: {tool_name}")


# ✅ GLOBAL INSTANCE
vector_store_service = VectorStoreService()