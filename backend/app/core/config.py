from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SECRET_KEY: str = "streetsense-production-secret-key-2024-delhi-ncr"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    DATABASE_URL: str = "sqlite:///./data/streetsense.db"
    MAPBOX_ACCESS_TOKEN: str = ""  # Optional. Get free at mapbox.com → enables real traffic

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
