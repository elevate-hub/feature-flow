from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Flag(Base):
    __tablename__ = "flags"
    __table_args__ = (
        CheckConstraint(
            "rollout_percentage BETWEEN 0 AND 100",
            name="ck_flags_rollout_percentage",
        ),
        UniqueConstraint(
            "environment_id", "key", name="uq_flag_key_per_environment"
        ),
        Index("idx_flags_environment_id", "environment_id"),
        Index("idx_flags_environment_key", "environment_id", "key"),
        Index("idx_flags_key", "key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    environment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("environments.id"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    default_value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    rollout_percentage: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    description: Mapped[str | None] = mapped_column(Text)
    owner_team: Mapped[str | None] = mapped_column(String(150))
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    environment = relationship("Environment", back_populates="flags")
    created_by_user = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="created_flags",
    )
    versions = relationship("FlagVersion", back_populates="flag")
    targeting_rules = relationship("TargetingRule", back_populates="flag")
    evaluation_stats = relationship("EvaluationStat", back_populates="flag")
    audit_logs = relationship("AuditLog", back_populates="flag")
