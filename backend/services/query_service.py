from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload
from models.models import Conversation, ConversationMessage
from database import get_db
from datetime import datetime

class QueryService:
    def __init__(self) -> None:
        self.db: AsyncSession = next(get_db())

    async def get_conversations(self, connection_name: Optional[str], user_id: int) -> List[Conversation]:
        query = select(Conversation).where(Conversation.user_id == user_id)
        
        if connection_name is not None:
            query = query.where(Conversation.connection_name == connection_name)
            
        result = await self.db.execute(
            query.options(joinedload(Conversation.messages))
            .order_by(Conversation.created_at.desc())
        )
        conversations = list(result.unique().scalars().all())
        return conversations

    async def create_conversation(self, user_id: int, connection_name: str, name: str) -> Conversation:
        conversation = Conversation(
            user_id=user_id,
            connection_name=connection_name,
            name=name
        )
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)
        return conversation

    async def add_conversation_message(
        self,
        conversation_id: int,
        prompt: str,
        sql_query: str,
        results_summary: str,
        result_data: dict  # Add this parameter
    ) -> ConversationMessage:
        # Ensure timestamp in result_data is a string
        if result_data and 'timestamp' in result_data:
            if isinstance(result_data['timestamp'], datetime):
                result_data['timestamp'] = result_data['timestamp'].isoformat()
                
        message = ConversationMessage(
            conversation_id=conversation_id,
            prompt=prompt,
            sql_query=sql_query,
            results_summary=results_summary,
            result_data=result_data  # Store full results
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def get_conversation_history(self, conversation_id: int) -> List[ConversationMessage]:
        result = await self.db.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.timestamp.asc())
        )
        return list(result.scalars().all())

    async def save_query(self, prompt: str, connection_name: str, sql_query: str, user_id: int) -> None:
        conversation = await self.create_conversation(
            user_id=user_id,
            connection_name=connection_name,
            name=f"Query: {prompt[:50]}..."
        )
        
        # Get the actual value from the SQLAlchemy model
        conversation_id = getattr(conversation, 'id')
        
        await self.add_conversation_message(
            conversation_id=conversation_id,
            prompt=prompt,
            sql_query=sql_query,
            results_summary="",
            result_data={
                "query": sql_query,
                "summary": "",
                "results": [],
                "visuals": []
            }
        )

    async def delete_conversation(self, conversation_id: int):
        # Delete messages first to maintain referential integrity
        await self.db.execute(
            delete(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
        )
        
        # Delete the conversation itself
        result = await self.db.execute(
            delete(Conversation)
            .where(Conversation.id == conversation_id)
        )
        
        if result.rowcount == 0:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        await self.db.commit()
