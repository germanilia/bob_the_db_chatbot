from pydantic import BaseModel
from typing import List
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
from enum import StrEnum

class DatabaseType(StrEnum):
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"

class AIConnection(BaseModel):
    name: str
    db_type: DatabaseType
    host: str
    port: int
    username: str
    password: str
    database_name: str
    
class AIQuery(BaseModel):
    query: str
    summary: str

class DatabaseSchema(BaseModel):
    tables: List[str]
    schema: str




class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    connection_name = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    name = Column(String(50), nullable=False)  # Changed to 50 characters max
    
    messages = relationship("ConversationMessage", back_populates="conversation")
    user = relationship("User", back_populates="conversations")

class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id")) 
    prompt = Column(Text)
    sql_query = Column(Text)
    results_summary = Column(Text)
    result_data = Column(JSON)  # New JSON field for full results
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    conversation = relationship("Conversation", back_populates="messages")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True)
    hashed_password = Column(String(100))
    
    conversations = relationship("Conversation", back_populates="user")
