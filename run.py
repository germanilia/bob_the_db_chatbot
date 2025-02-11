import sys
import os
from pathlib import Path

# Add the project root directory to Python path
project_root = Path(__file__).resolve().parent
sys.path.append(str(project_root))

from backend.app import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.app:app", host="0.0.0.0", port=9876, reload=True) 