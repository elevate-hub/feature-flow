from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Environment(Base):
    __tablename__ = "environments"
    __table_args__ = (UniqueConstraint("name", name="environments_name_key"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    flags = relationship("Flag", back_populates="environment")
    evaluation_stats = relationship("EvaluationStat", back_populates="environment")
