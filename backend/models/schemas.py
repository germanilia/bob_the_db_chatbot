from pydantic import BaseModel, Field, validator
from enum import StrEnum
from typing import Optional

class DatabaseType(StrEnum):
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"

class AIConnection(BaseModel):
    """Connection details for a database with all required information"""
    name: str
    db_type: DatabaseType
    host: str
    port: int
    username: str
    password: str
    database_name: str = Field(..., description="Database name is required")
    server_id: Optional[str] = None
    alias: str

    @validator('database_name')
    def validate_database_name(cls, v):
        """Validate database_name is not empty"""
        if not v or not v.strip():
            raise ValueError("Database name cannot be empty")
        return v.strip()
