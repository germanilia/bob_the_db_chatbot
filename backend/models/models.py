from typing import List
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from pydantic import BaseModel

# Try both import styles to handle different contexts
try:
    from backend.database import Base
except ImportError:
    from database import Base

class DatabaseSchema(BaseModel):
    tables: List[str]
    schema: str

class Server(Base):
    __tablename__ = "servers"
    
    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(String(100), unique=True, index=True)  # The generated ID like postgresql_localhost_5432_postgres
    db_type = Column(String(50), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(String(100), nullable=False)
    password = Column(String(255), nullable=False)
    alias = Column(String(100))
    database_name = Column(String(100))  # Added database_name field
    created_at = Column(DateTime, default=datetime.utcnow)
    
    conversations = relationship("Conversation", back_populates="server")

class Conversation(Base):
    __tablename__ = "conversations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    server_id = Column(Integer, ForeignKey("servers.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    name = Column(String(50), nullable=False)
    database_name = Column(String(100))  # Database name for this conversation
    
    messages = relationship("ConversationMessage", back_populates="conversation")
    user = relationship("User", back_populates="conversations")
    server = relationship("Server", back_populates="conversations")

class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id")) 
    prompt = Column(Text())
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
