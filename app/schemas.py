"""Pydantic request/response models for the API."""
from typing import Any

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        description="Natural-language question to send to the data agent.",
    )


class AskResponse(BaseModel):
    answer: str = Field(
        ...,
        description="The final answer from the agent (FINAL_RESPONSE text only).",
    )
    thoughts: list[str] = Field(
        default_factory=list,
        description="Agent's intermediate reasoning steps (THOUGHT text blocks).",
    )
    follow_ups: list[str] = Field(
        default_factory=list,
        description="Suggested follow-up questions from the agent.",
    )
    sql: str | None = Field(None, description="Generated SQL, if the agent produced one.")
    data: list[dict[str, Any]] | None = Field(
        None, description="Query result rows, if returned."
    )
    chart_spec: dict[str, Any] | None = Field(
        None,
        description="Vega-Lite spec — render client-side with vega-embed.",
    )
    raw_messages: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Full streamed messages, useful for debugging.",
    )


class AgentInfoResponse(BaseModel):
    name: str
    display_name: str | None = None
    description: str | None = None