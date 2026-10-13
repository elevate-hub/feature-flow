from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class TargetingRule(Base):
    __tablename__ = "targeting_rules"
    __table_args__ = (Index("idx_targeting_rules_flag_priority", "flag_id", "priority"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    flag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("flags.id", ondelete="CASCADE"), nullable=False
    )
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    attribute: Mapped[str | None] = mapped_column(String(100))
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    result: Mapped[Any] = mapped_column(JSONB, nullable=False)
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("100")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    flag = relationship("Flag", back_populates="targeting_rules")
