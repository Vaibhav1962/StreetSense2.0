#!/usr/bin/env python3
"""Initialize the database with default users."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

os.makedirs("data", exist_ok=True)

from app.core.database import create_db_and_tables, engine
from app.core.security import get_password_hash
from app.models.user import User
from sqlmodel import Session, select


def init_db():
    create_db_and_tables()
    with Session(engine) as session:
        # Check if any users exist
        existing = session.exec(select(User)).first()
        if existing:
            print("✅ Database already initialized, skipping...")
            return

        admin = User(
            username="admin",
            email="admin@streetsense.app",
            full_name="Administrator",
            hashed_password=get_password_hash("admin123"),
            is_active=True,
            is_admin=True,
        )
        demo = User(
            username="demo",
            email="demo@streetsense.app",
            full_name="Demo User",
            hashed_password=get_password_hash("demo123"),
            is_active=True,
            is_admin=False,
        )
        session.add(admin)
        session.add(demo)
        session.commit()
        print("✅ Default users created:")
        print("   👤 admin / admin123 (Administrator)")
        print("   👤 demo / demo123 (Demo User)")


if __name__ == "__main__":
    init_db()
