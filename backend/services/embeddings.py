import os
import logging
from typing import List
from langchain_community.embeddings import HuggingFaceEmbeddings
from backend.config import EMBEDDING_MODEL, HF_CACHE_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmbeddingService:
    """Singleton embedding service"""
    _instance = None
    _embeddings = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Initialize the embedding model"""
        hf_token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
        if not hf_token:
            logger.warning("HUGGINGFACEHUB_API_TOKEN not found in environment")
        
        try:
            self._embeddings = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL,
                model_kwargs={
                    'device': 'cpu',
                    'trust_remote_code': True
                },
                encode_kwargs={
                    'normalize_embeddings': True,
                    'batch_size': 32
                },
                cache_folder=HF_CACHE_PATH
            )
            
            # Test the model
            test_text = "test"
            _ = self._embeddings.embed_query(test_text)
            logger.info(f"✅ Successfully loaded embedding model: {EMBEDDING_MODEL}")
            
        except Exception as e:
            logger.error(f"❌ Failed to load embedding model: {str(e)}")
            raise
    
    def get_embeddings(self):
        """Get the embedding model instance"""
        return self._embeddings
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple documents"""
        return self._embeddings.embed_documents(texts)
    
    def embed_query(self, text: str) -> List[float]:
        """Embed a single query"""
        return self._embeddings.embed_query(text)

# Global instance
embedding_service = EmbeddingService()