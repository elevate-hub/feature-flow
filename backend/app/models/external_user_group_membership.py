from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class ExternalUserGroupMembership(Base):
    __tablename__ = "external_user_group_memberships"
    __table_args__ = (
        UniqueConstraint("group_id", "user_key", name="uq_external_group_user_key"),
        Index("idx_external_group_memberships_group_id", "group_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("user_groups.id", ondelete="CASCADE"), nullable=False
    )
    user_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    group = relationship("UserGroup", back_populates="external_memberships")
