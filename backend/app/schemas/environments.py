from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EnvironmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> "EnvironmentCreate":
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Environment name cannot be blank")
        return self


class EnvironmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> "EnvironmentUpdate":
        if "name" in self.model_fields_set:
            if self.name is None:
                raise ValueError("Environment name cannot be null")
            self.name = self.name.strip()
            if not self.name:
                raise ValueError("Environment name cannot be blank")
        return self


class EnvironmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    created_at: datetime
