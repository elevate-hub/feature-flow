from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class FlagVersion(Base):
    __tablename__ = "flag_versions"
    __table_args__ = (
        UniqueConstraint("flag_id", "version_number", name="uq_flag_version"),
        Index("idx_flag_versions_flag_id", "flag_id", "version_number"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    flag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("flags.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    flag = relationship("Flag", back_populates="versions")
    created_by_user = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="created_flag_versions",
    )
