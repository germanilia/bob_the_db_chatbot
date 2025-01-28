from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload, selectinload
from models.models import Conversation, ConversationMessage, Server
from database import get_db
from datetime import datetime

class QueryService:
    def __init__(self) -> None:
        self.db: AsyncSession = next(get_db())

    async def get_conversations(self, connection_name: Optional[str], user_id: int) -> List[Conversation]:
        async with self.db as session:
            query = (
                select(Conversation)
                .options(
                    selectinload(Conversation.messages),
                    selectinload(Conversation.server)
                )
                .filter(Conversation.user_id == user_id)
            )
            
            if connection_name:
                query = query.join(Server).filter(Server.alias == connection_name)
            
            result = await session.execute(query)
            return list(result.scalars().all())

    async def create_conversation(
        self, 
        user_id: int, 
        connection_name: str, 
        name: str,
        database_name: str
    ) -> Conversation:
        async with self.db as session:
            # Get server by alias (which was previously connection name)
            result = await session.execute(
                select(Server).filter(Server.alias == connection_name)
            )
            server = result.scalar_one_or_none()
            if not server:
                raise Exception(f"Server not found: {connection_name}")
            # Create new conversation
            conversation = Conversation(
                user_id=user_id,
                server_id=server.id,
                name=name[:50],
                database_name=database_name
            )
            session.add(conversation)
            await session.commit()
            
            # Refresh to get relationships
            await session.refresh(conversation, ['messages', 'server'])
            return conversation

    async def add_conversation_message(
        self,
        conversation_id: int,
        prompt: str,
        sql_query: str,
        results_summary: str,
        result_data: dict,
        user_id: int = 1,  # Default user ID, no longer Optional
        connection_name: Optional[str] = None,
        database_name: Optional[str] = None
    ) -> None:
        async with self.db as session:
            # First check if conversation exists
            result = await session.execute(
                select(Conversation).filter(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()
            
            # If conversation doesn't exist and we have the required info, create it
            if not conversation:
                if not connection_name or not database_name:
                    raise Exception(f"Conversation {conversation_id} not found and insufficient information to create new one")
                
                conversation = await self.create_conversation(
                    user_id=user_id,
                    connection_name=connection_name,
                    name=f"Query: {prompt[:50]}...",
                    database_name=database_name
                )
                # Get the actual value from the SQLAlchemy model
                conversation_id = getattr(conversation, 'id')

            message = ConversationMessage(
                conversation_id=conversation_id,
                prompt=prompt,
                sql_query=sql_query,
                results_summary=results_summary,
                result_data=result_data
            )
            session.add(message)
            await session.commit()

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
            name=f"Query: {prompt[:50]}...",
            database_name="",
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

    async def delete_conversation(self, conversation_id: int) -> None:
        async with self.db as session:
            # Get conversation with messages
            result = await session.execute(
                select(Conversation)
                .options(selectinload(Conversation.messages))
                .filter(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()
            
            if conversation:
                # Delete all messages first
                for message in conversation.messages:
                    await session.delete(message)
                # Then delete the conversation
                await session.delete(conversation)
                await session.commit()
