from setuptools import setup, find_packages

setup(
    name="db_chatter",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "sqlalchemy",
        "pydantic",
        "pandas",
        "asyncpg",
        "asyncmy",
        "python-dotenv",
    ],
) 