import logging
from backend.app.db import Base, SessionLocal, engine
from backend.app.models import Conversation, Message, RiskEvent, User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def seed_database() -> None:
    """
    Seeds database with initial users and conversations:
    - Asha: verified, not new (ID 1)
    - Ravi: verified, not new (ID 2)
    - Sam: unverified, new (demo scammer) (ID 3)
    - Conversation 1: between Asha and Sam
    - Conversation 2: between Asha and Ravi
    """
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        logger.info("Clearing existing seed data...")
        db.query(RiskEvent).delete()
        db.query(Message).delete()
        db.query(Conversation).delete()
        db.query(User).delete()
        db.commit()

        logger.info("Creating users...")
        asha = User(name="Asha", is_new=False, verified=True)
        ravi = User(name="Ravi", is_new=False, verified=True)
        sam = User(name="Sam", is_new=True, verified=False)

        db.add_all([asha, ravi, sam])
        db.commit()
        db.refresh(asha)
        db.refresh(ravi)
        db.refresh(sam)
        logger.info(f"Users created: Asha (id={asha.id}), Ravi (id={ravi.id}), Sam (id={sam.id})")

        logger.info("Creating conversations...")
        conv1 = Conversation(user_a=asha.id, user_b=sam.id, risk=0, state="normal")
        conv2 = Conversation(user_a=asha.id, user_b=ravi.id, risk=0, state="normal")

        db.add_all([conv1, conv2])
        db.commit()
        db.refresh(conv1)
        db.refresh(conv2)
        logger.info(f"Conversation 1 created between Asha (id={asha.id}) and Sam (id={sam.id}) with id={conv1.id}")
        logger.info(f"Conversation 2 created between Asha (id={asha.id}) and Ravi (id={ravi.id}) with id={conv2.id}")

    logger.info("Database seeding successfully completed.")


if __name__ == "__main__":
    seed_database()
