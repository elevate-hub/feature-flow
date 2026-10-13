from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class UserGroupMembership(Base):
    __tablename__ = "user_group_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "group_id", name="uq_user_group_membership"),
        Index("idx_memberships_group_id", "group_id"),
        Index("idx_memberships_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    group_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_groups.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    user = relationship("User", back_populates="group_memberships")
    group = relationship("UserGroup", back_populates="memberships")
