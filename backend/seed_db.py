"""Standalone database seeding utility for CMRL ITAM."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.database import Base, SessionLocal, engine
from app.services.seed import seed_demo_data


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seeded = seed_demo_data(db)
        if seeded:
            print("Successfully seeded CMRL ITAM demo data.")
        else:
            print("Database already contains users/data; skipping seed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
