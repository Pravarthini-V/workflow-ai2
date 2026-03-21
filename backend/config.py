import os
from pathlib import Path

# ✅ FIXED: Set BASE_DIR to backend folder (not project root)
BASE_DIR = Path(__file__).parent

# Paths
STORAGE_PATH = os.path.join(BASE_DIR, "storage")
HF_CACHE_PATH = os.path.join(BASE_DIR, "hf_cache")
TOOLS_PATH = os.path.join(BASE_DIR, "tools")

# Ensure directories exist
os.makedirs(STORAGE_PATH, exist_ok=True)
os.makedirs(HF_CACHE_PATH, exist_ok=True)
os.makedirs(TOOLS_PATH, exist_ok=True)

# =========================
# 🔹 Embedding Model
# =========================
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# =========================
# 🔹 LLM Model
# =========================
GROQ_MODEL = "llama-3.1-8b-instant"

# =========================
# 🔹 Chunking Parameters
# =========================
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

# =========================
# 🔹 MMR Retrieval Parameters
# =========================
MMR_K = 5
MMR_FETCH_K = 20
MMR_LAMBDA = 0.7

# =========================
# 🔹 Workspaces
# =========================
WEATHER_WORKSPACE = "weather_workspace"
WORKFLOW_WORKSPACE = "workflow_workspace"

# =========================
# 🔹 Vector Store
# =========================
CHROMA_PERSIST_DIR = os.path.join(STORAGE_PATH, "chroma_db")