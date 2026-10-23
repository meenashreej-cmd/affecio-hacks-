from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.models import User
from backend.app.schemas import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserRead])
def get_users(db: Session = Depends(get_db)) -> list[User]:
    """Retrieve all users in the system."""
    return db.query(User).order_by(User.id.asc()).all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    """Create a new user profile."""
    user = User(
        name=payload.name,
        is_new=payload.is_new,
        verified=payload.verified,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    """Retrieve a specific user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
