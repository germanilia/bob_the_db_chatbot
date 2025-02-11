# DB Chatter

A database chatbot application with a React frontend and FastAPI backend.

## Project Description

DB Chatter is an AI-powered database interaction tool that allows users to query and analyze their databases using natural language. Instead of writing complex SQL queries, users can simply ask questions in plain English, and the application will convert these questions into appropriate database queries.

Key Features:
- Natural language to SQL conversion
- Interactive chat interface for database queries
- Support for complex database analysis and exploration
- Real-time query execution and results visualization
- Secure AWS-based authentication and authorization
- Modern React frontend with responsive design
- Fast and efficient FastAPI backend

## Prerequisites

- Docker and Docker Compose
- PostgreSQL
- Python 3.11+
- Node.js 18+
- npm
- AWS Bedrock access with the `anthropic.claude-3-5-sonnet-20241022-v2:0` model enabled

## Database Setup

1. Create a PostgreSQL database named `bob_the_db_chatbot`:
```sql
CREATE DATABASE bob_the_db_chatbot;
```

## Environment Setup

1. Root directory setup:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your:
   - Database URL for synchronous connections
   - When running in Docker and connecting to local database, use `host.docker.internal` instead of `localhost`:
     ```
     SYNC_DATABASE_URL=postgresql://postgres:Cowabunga1!@host.docker.internal:5432/bob_the_db_chatbot
     ```

2. Backend setup:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env` with your:
   - AWS credentials (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
   - Database URLs (both async and sync connections)
   - When running in Docker and connecting to local database, use `host.docker.internal`:
     ```
     DATABASE_URL=postgresql+asyncpg://postgres:Cowabunga1!@host.docker.internal/bob_the_db_chatbot
     SYNC_DATABASE_URL=postgresql://postgres:Cowabunga1!@host.docker.internal/bob_the_db_chatbot
     ```
   - API base URL

3. Frontend setup:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   Edit `frontend/.env` with your:
   - API base URL (defaults to http://localhost:9876/api)

Note: Make sure all three .env files are properly configured before starting the application.

## Running with Docker

1. Start all services using Docker Compose:
   ```bash
   docker compose up --build
   ```

This will:
- Run database migrations automatically
- Start the frontend at http://localhost:9877
- Start the backend at http://localhost:9876

## Local Development Setup

### Backend

1. Create and activate a Python virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run migrations:
   ```bash
   alembic upgrade head
   ```

4. Run the backend server:
   ```bash
   uvicorn app:app --reload
   ```

### Frontend

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Accessing the Application

- Frontend: http://localhost:9877
- Backend API: http://localhost:9876
- API Documentation: http://localhost:9876/docs