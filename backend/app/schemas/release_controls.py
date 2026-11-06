from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RuleType = Literal["user", "attribute", "user_group"]
RuleOperator = Literal[
    "equals",
    "not_equals",
    "contains",
    "in",
    "greater_than",
    "less_than",
    "is_set",
    "is_not_set",
    "in_group",
]


class TargetingRuleCreate(BaseModel):
    rule_type: RuleType = "attribute"
    operator: RuleOperator
    attribute: str | None = Field(default=None, max_length=100)
    value: Any
    result: Any
    priority: int = Field(default=100, ge=0, le=2_147_483_647)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_rule(self) -> "TargetingRuleCreate":
        if self.rule_type == "user":
            if self.operator != "equals" or not isinstance(self.value, str):
                raise ValueError("User rules require equals and an external user key")
            self.value = self.value.strip()
            if not self.value:
                raise ValueError("User rules require a non-blank external user key")
            if self.attribute is not None:
                raise ValueError("User rules do not use an attribute")
        elif self.rule_type == "user_group":
            if self.operator != "in_group" or type(self.value) is not int or self.value <= 0:
                raise ValueError("User group rules require a positive group ID and in_group operator")
            if self.attribute is not None:
                raise ValueError("User group rules do not use an attribute")
        else:
            if self.operator == "in_group":
                raise ValueError("in_group is only valid for user group rules")
            if not self.attribute or not self.attribute.strip():
                raise ValueError("Attribute rules require an attribute")
            self.attribute = self.attribute.strip()
            if self.operator == "in" and not isinstance(self.value, list):
                raise ValueError("The in operator requires a JSON array")
            if self.operator in {"greater_than", "less_than"} and (
                not isinstance(self.value, (int, float)) or isinstance(self.value, bool)
            ):
                raise ValueError("Numeric comparison operators require a number")
        return self


class TargetingRuleUpdate(BaseModel):
    rule_type: RuleType | None = None
    operator: RuleOperator | None = None
    attribute: str | None = Field(default=None, max_length=100)
    value: Any = None
    result: Any = None
    priority: int | None = Field(default=None, ge=0, le=2_147_483_647)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_rule(self) -> "TargetingRuleUpdate":
        if "value" in self.model_fields_set and isinstance(self.value, str):
            self.value = self.value.strip()
        return self


class TargetingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flag_id: int
    rule_type: RuleType
    operator: RuleOperator
    attribute: str | None
    value: Any
    result: Any
    priority: int
    is_active: bool
    created_at: datetime


class UserGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> "UserGroupCreate":
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Group name cannot be blank")
        return self


class UserGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None

    @model_validator(mode="after")
    def validate_name(self) -> "UserGroupUpdate":
        if "name" in self.model_fields_set:
            if self.name is None or not self.name.strip():
                raise ValueError("Group name cannot be blank")
            self.name = self.name.strip()
        return self


class GroupMemberResponse(BaseModel):
    id: int
    user_key: str


class UserGroupResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    member_count: int
    members: list[GroupMemberResponse]


class AddGroupMemberRequest(BaseModel):
    user_key: str = Field(min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_user_key(self) -> "AddGroupMemberRequest":
        self.user_key = self.user_key.strip()
        if not self.user_key:
            raise ValueError("External user key cannot be blank")
        return self


class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flag_key: str = Field(min_length=1, max_length=255)
    environment: str = Field(min_length=1, max_length=100)
    user_key: str | None = Field(default=None, min_length=1, max_length=255)
    attributes: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_user_key(self) -> "EvaluationRequest":
        if self.user_key is not None:
            self.user_key = self.user_key.strip()
            if not self.user_key:
                raise ValueError("External user key cannot be blank")
        return self


class EvaluationResponse(BaseModel):
    flag_key: str
    environment: str
    value: Any
    reason: str
    rule_id: int | None = None
    rollout_bucket: int | None = None
