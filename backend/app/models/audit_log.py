from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("idx_audit_log_created_at", "created_at"),
        Index("idx_audit_log_flag_created_at", "flag_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    flag_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("flags.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    before_value: Mapped[Any | None] = mapped_column(JSONB)
    after_value: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    user = relationship("User", back_populates="audit_logs")
    flag = relationship("Flag", back_populates="audit_logs")
