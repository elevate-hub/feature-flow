from datetime import date

from sqlalchemy import (
    BigInteger,
    Date,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class EvaluationStat(Base):
    __tablename__ = "evaluation_stats"
    __table_args__ = (
        UniqueConstraint(
            "flag_id",
            "environment_id",
            "date",
            "hour",
            name="uq_evaluation_period",
        ),
        Index("idx_evaluation_stats_environment_date", "environment_id", "date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    flag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("flags.id", ondelete="CASCADE"), nullable=False
    )
    environment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    evaluation_count: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("0")
    )
    flag = relationship("Flag", back_populates="evaluation_stats")
    environment = relationship("Environment", back_populates="evaluation_stats")
