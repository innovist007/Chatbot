# """Wrapper around the Google Cloud Conversational Analytics SDK."""
# from __future__ import annotations

# import logging
# from typing import Any

# from google.cloud import geminidataanalytics
# from google.protobuf.json_format import MessageToDict

# from app.config import Settings

# logger = logging.getLogger(__name__)


# class AgentService:
#     """Thin, testable wrapper around the Gemini Data Analytics client."""

#     def __init__(self, settings: Settings) -> None:
#         self.settings = settings
#         # Clients pick up Application Default Credentials automatically.
#         self.chat_client = geminidataanalytics.DataChatServiceClient()
#         self.agent_client = geminidataanalytics.DataAgentServiceClient()

#     # ------------------------------------------------------------------ ask
#     def ask(self, question: str) -> dict[str, Any]:
#         """Send a question to the data agent and collect the streamed reply."""
#         request = geminidataanalytics.ChatRequest(
#             parent=self.settings.parent_resource,
#             messages=[
#                 geminidataanalytics.Message(
#                     user_message=geminidataanalytics.UserMessage(text=question)
#                 )
#             ],
#             data_agent_context=geminidataanalytics.DataAgentContext(
#                 data_agent=self.settings.agent_resource,
#             ),
#         )

#         thoughts: list[str] = []
#         final_parts: list[str] = []
#         follow_ups: list[str] = []
#         sql_text: str | None = None
#         data_rows: list[dict[str, Any]] | None = None
#         chart_spec: dict[str, Any] | None = None
#         raw_messages: list[dict[str, Any]] = []

#         logger.info("Sending question to agent: %s", question)

#         for reply in self.chat_client.chat(request=request):
#             as_dict = MessageToDict(reply._pb, preserving_proto_field_name=True)
#             raw_messages.append(as_dict)

#             sys_msg = as_dict.get("system_message") or {}

#             # ---- Text: classify by text_type ----
#             text_block = sys_msg.get("text") or {}
#             parts = [p for p in text_block.get("parts", []) or [] if p]
#             if parts:
#                 text_type = text_block.get("text_type")  # THOUGHT | FINAL_RESPONSE | None
#                 if text_type == "THOUGHT":
#                     thoughts.extend(parts)
#                 elif text_type == "FINAL_RESPONSE":
#                     final_parts.extend(parts)
#                 else:
#                     # No text_type usually means follow-up suggestions
#                     follow_ups.extend(parts)

#             # ---- Generated SQL + result data ----
#             data_block = sys_msg.get("data") or {}
#             if data_block.get("generated_sql"):
#                 sql_text = data_block["generated_sql"]
#             result_block = data_block.get("result") or {}
#             if result_block.get("data"):
#                 data_rows = result_block["data"]

#             # ---- Vega-Lite chart spec ----
#             chart_block = sys_msg.get("chart") or {}
#             chart_result = chart_block.get("result") or {}
#             if chart_result.get("vega_config"):
#                 chart_spec = chart_result["vega_config"]

#         return {
#             "answer": "\n\n".join(final_parts).strip(),
#             "thoughts": thoughts,
#             "follow_ups": follow_ups,
#             "sql": sql_text,
#             "data": data_rows,
#             "chart_spec": chart_spec,
#             "raw_messages": raw_messages,
#         }

#     # ------------------------------------------------------------- agent info
#     def get_agent_info(self) -> dict[str, Any]:
#         agent = self.agent_client.get_data_agent(name=self.settings.agent_resource)
#         return {
#             "name": agent.name,
#             "display_name": getattr(agent, "display_name", None),
#             "description": getattr(agent, "description", None),
#         }










"""Wrapper around the Google Cloud Conversational Analytics SDK."""
from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import Any

from google.cloud import geminidataanalytics
from google.protobuf.json_format import MessageToDict

from app.config import Settings

logger = logging.getLogger(__name__)


class AgentService:
    """Thin, testable wrapper around the Gemini Data Analytics client."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.chat_client = geminidataanalytics.DataChatServiceClient()
        self.agent_client = geminidataanalytics.DataAgentServiceClient()

    # ------------------------------------------------------------------ helpers
    def _build_request(self, question: str) -> geminidataanalytics.ChatRequest:
        return geminidataanalytics.ChatRequest(
            parent=self.settings.parent_resource,
            messages=[
                geminidataanalytics.Message(
                    user_message=geminidataanalytics.UserMessage(text=question)
                )
            ],
            data_agent_context=geminidataanalytics.DataAgentContext(
                data_agent=self.settings.agent_resource,
            ),
        )

    # ------------------------------------------------------------------- stream
    def ask_stream(self, question: str) -> Iterator[dict[str, Any]]:
        """Stream events from the agent as they arrive.

        Event shapes:
          {"type": "thought",    "parts": [str, ...]}
          {"type": "answer",     "parts": [str, ...]}
          {"type": "follow_ups", "parts": [str, ...]}
          {"type": "sql",        "sql":   str}
          {"type": "data",       "rows":  list[dict]}
          {"type": "chart",      "spec":  dict}        # vega-lite
          {"type": "done"}
        """
        request = self._build_request(question)
        logger.info("Streaming question to agent: %s", question)

        for reply in self.chat_client.chat(request=request):
            as_dict = MessageToDict(reply._pb, preserving_proto_field_name=True)
            sys_msg = as_dict.get("system_message") or {}

            # ---- text classified by text_type ----
            text_block = sys_msg.get("text") or {}
            parts = [p for p in text_block.get("parts", []) or [] if p]
            if parts:
                text_type = text_block.get("text_type")
                if text_type == "THOUGHT":
                    yield {"type": "thought", "parts": parts}
                elif text_type == "FINAL_RESPONSE":
                    yield {"type": "answer", "parts": parts}
                else:
                    # text_type missing == follow-up suggestions
                    yield {"type": "follow_ups", "parts": parts}

            # ---- generated SQL + result data ----
            data_block = sys_msg.get("data") or {}
            if data_block.get("generated_sql"):
                yield {"type": "sql", "sql": data_block["generated_sql"]}
            result_block = data_block.get("result") or {}
            if result_block.get("data"):
                yield {"type": "data", "rows": result_block["data"]}

            # ---- vega-lite chart spec ----
            chart_block = sys_msg.get("chart") or {}
            chart_result = chart_block.get("result") or {}
            if chart_result.get("vega_config"):
                yield {"type": "chart", "spec": chart_result["vega_config"]}

        yield {"type": "done"}

    # ----------------------------------------------------- non-streaming wrapper
    def ask(self, question: str) -> dict[str, Any]:
        """Collect the stream into a single response (back-compat for /chat/ask)."""
        thoughts: list[str] = []
        final_parts: list[str] = []
        follow_ups: list[str] = []
        sql_text: str | None = None
        data_rows: list[dict[str, Any]] | None = None
        chart_spec: dict[str, Any] | None = None

        for ev in self.ask_stream(question):
            t = ev["type"]
            if t == "thought":
                thoughts.extend(ev["parts"])
            elif t == "answer":
                final_parts.extend(ev["parts"])
            elif t == "follow_ups":
                follow_ups.extend(ev["parts"])
            elif t == "sql":
                sql_text = ev["sql"]
            elif t == "data":
                data_rows = ev["rows"]
            elif t == "chart":
                chart_spec = ev["spec"]

        return {
            "answer": "\n\n".join(final_parts).strip(),
            "thoughts": thoughts,
            "follow_ups": follow_ups,
            "sql": sql_text,
            "data": data_rows,
            "chart_spec": chart_spec,
            "raw_messages": [],
        }

    # ------------------------------------------------------------- agent info
    def get_agent_info(self) -> dict[str, Any]:
        agent = self.agent_client.get_data_agent(name=self.settings.agent_resource)
        return {
            "name": agent.name,
            "display_name": getattr(agent, "display_name", None),
            "description": getattr(agent, "description", None),
        }