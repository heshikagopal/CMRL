import os
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "CMRL IT Asset Management & Monitoring System"
    APP_ENV: str = "development"
    DATABASE_URL: str = f"sqlite:///{(BASE_DIR / 'cmrl_itam.db').as_posix()}"

    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-only-secret-override-via-env")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"

    UPLOAD_DIR: str = "storage/uploads"
    QR_DIR: str = "storage/qrcodes"
    MAX_UPLOAD_SIZE_MB: int = 10

    AUTO_SEED_DEMO: bool = True
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        if not p.is_absolute():
            p = BASE_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def qr_path(self) -> Path:
        p = Path(self.QR_DIR)
        if not p.is_absolute():
            p = BASE_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
