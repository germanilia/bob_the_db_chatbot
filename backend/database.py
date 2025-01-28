import asyncio
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
try:
    from models.schemas import AIConnection
except ImportError:
    from backend.models.schemas import AIConnection

logger = logging.getLogger(__name__)

load_dotenv()

SYNC_DATABASE_URL = os.getenv("COMPOSE_SYNC_DATABASE_URL") or os.getenv("SYNC_DATABASE_URL")
DATABASE_URL = os.getenv("COMPOSE_DATABASE_URL") or os.getenv("DATABASE_URL")

if not SYNC_DATABASE_URL or not DATABASE_URL:
    raise ValueError("Missing Database urls")

if os.getenv("COMPOSE_DATABASE_URL"):
    DATABASE_URL = DATABASE_URL.replace("localhost","host.docker.internal").replace("127.0.0.1","host.docker.internal")
if os.getenv("COMPOSE_SYNC_DATABASE_URL"):
    SYNC_DATABASE_URL = SYNC_DATABASE_URL.replace("localhost","host.docker.internal").replace("127.0.0.1","host.docker.internal")
# Async engine for application

async_engine = create_async_engine(DATABASE_URL) # type: ignore
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession
)

# Sync engine for migrations

sync_engine = create_engine(SYNC_DATABASE_URL) # type: ignore
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

class DatabaseService:
    def __init__(self):
        self.engines = {}

    async def _get_engine(self, connection: AIConnection):
        if connection.name not in self.engines:
            # Create new engine
            engine = create_async_engine(
                f"postgresql+asyncpg://{connection.username}:{connection.password}@{connection.host}:{connection.port}/{connection.database_name}"
            )
            self.engines[connection.name] = {
                "engine": engine,
                "last_used": datetime.now()
            }
        
        # Add periodic invalidation
        if datetime.now() - self.engines[connection.name]["last_used"] > timedelta(minutes=5):
            await self.engines[connection.name]["engine"].dispose()
            del self.engines[connection.name]
            return await self._get_engine(connection)
            
        # Update last used time
        self.engines[connection.name]["last_used"] = datetime.now()
        return self.engines[connection.name]["engine"]

def get_db():
    """Get async database session with proper cleanup"""
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        try:
            # Explicitly close connections
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(db.close())
            else:
                loop.run_until_complete(db.close())
        except Exception as e:
            logger.error(f"Error closing session: {str(e)}")

def get_sync_db():
    """Get sync database session for migrations"""
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()
