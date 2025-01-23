import asyncio
import logging
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# Async engine for application
DATABASE_URL = os.getenv("COMPOSE_DATABASE_URL") or os.getenv("DATABASE_URL")
async_engine = create_async_engine(DATABASE_URL) # type: ignore
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession
)

# Sync engine for migrations
SYNC_DATABASE_URL = os.getenv("COMPOSE_SYNC_DATABASE_URL") or os.getenv("SYNC_DATABASE_URL")
sync_engine = create_engine(SYNC_DATABASE_URL) # type: ignore
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

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
