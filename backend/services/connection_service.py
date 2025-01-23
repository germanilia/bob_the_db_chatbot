from typing import List
from models.models import AIConnection
import json
from pathlib import Path

class ConnectionService:
    def __init__(self):
        self.connections_file = Path("connections.json")
        if not self.connections_file.exists():
            with open(self.connections_file, 'w') as f:
                json.dump([], f)

    async def add_connection(self, connection: AIConnection):
        connections = await self.get_ai_connections()
        connections.append(connection)
        with open(self.connections_file, 'w') as f:
            json.dump([conn.model_dump() for conn in connections], f, indent=2)

    async def get_ai_connections(self) -> List[AIConnection]:
        with open(self.connections_file, 'r') as f:
            connections = json.load(f)
        return [AIConnection(**conn) for conn in connections]

    async def get_connection_by_name(self, name: str) -> AIConnection:
        connections = await self.get_ai_connections()
        for conn in connections:
            if conn.name == name:
                return conn
        raise Exception(f"Connection not found: {name}")

    async def delete_connection(self, name: str):
        connections = await self.get_ai_connections()
        connections = [conn for conn in connections if conn.name != name]
        with open(self.connections_file, 'w') as f:
            json.dump([conn.model_dump() for conn in connections], f, indent=2) 