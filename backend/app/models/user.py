from typing import Optional
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    full_name: Optional[str] = None
    hashed_password: str
    is_active: bool = True
    is_admin: bool = False


class UserCreate(SQLModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None


class UserRead(SQLModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    is_admin: bool = False


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
