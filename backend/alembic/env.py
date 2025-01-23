import sys
from alembic import context
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.declarative import declarative_base
# from backend.database import Base

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent.parent
print("-----------------------------------------------")
print(project_root)
print("-----------------------------------------------")
sys.path.insert(0, str(project_root))

# Now import your models using absolute path
# from backend.models.models import Base  # noqa: E402

Base = declarative_base()
# Load environment variables from .env
base_dir = Path(__file__).resolve().parent.parent.parent  # Adjust path if needed
load_dotenv(os.path.join(base_dir, '.env'))

# This is the Alembic Config object
config = context.config

# Use your environment variable
SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL")
if not SYNC_DATABASE_URL:
    raise ValueError("SYNC_DATABASE_URL environment variable is not set")

# Set the SQLAlchemy URL in the config
config.set_main_option("sqlalchemy.url", SYNC_DATABASE_URL)

# Import your models here

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    context.configure(
        url=SYNC_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode using SYNC connection."""
    from backend.database import sync_engine  # Import the sync engine
    
    with sync_engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # Add this for SQLAlchemy 2.0 compatibility
            user_module_prefix="sa.orm.",
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
