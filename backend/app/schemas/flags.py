from datetime import datetime
from math import isfinite
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


FlagType = Literal["boolean", "string", "number", "json"]


def _validate_default_value(flag_type: FlagType, value: Any) -> None:
    valid = {
        "boolean": isinstance(value, bool),
        "string": isinstance(value, str),
        "number": (
            isinstance(value, int) and not isinstance(value, bool)
        )
        or (isinstance(value, float) and isfinite(value)),
        "json": True,
    }[flag_type]
    if not valid:
        raise ValueError(f"default_value must match flag type '{flag_type}'")


class FlagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=255)
    type: FlagType
    default_value: Any
    environment_id: int = Field(gt=0)
    enabled: bool = True
    description: str | None = None

    @model_validator(mode="after")
    def validate_default(self) -> "FlagCreate":
        _validate_default_value(self.type, self.default_value)
        if not self.key.strip():
            raise ValueError("Flag key cannot be blank")
        self.key = self.key.strip()
        return self


class FlagUpdate(BaseModel):
    key: str | None = Field(default=None, min_length=1, max_length=255)
    type: FlagType | None = None
    default_value: Any = None
    environment_id: int | None = Field(default=None, gt=0)
    enabled: bool | None = None
    description: str | None = None

    @model_validator(mode="after")
    def validate_supplied_fields(self) -> "FlagUpdate":
        if self.key is not None:
            if not self.key.strip():
                raise ValueError("Flag key cannot be blank")
            self.key = self.key.strip()
        if "type" in self.model_fields_set and "default_value" in self.model_fields_set:
            if self.type is not None:
                _validate_default_value(self.type, self.default_value)
        return self


class FlagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    type: FlagType
    default_value: Any
    enabled: bool
    description: str | None
    environment_id: int
    created_at: datetime
    updated_at: datetime
