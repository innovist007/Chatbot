"""Chat endpoints — talk to the data agent."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.schemas import AgentInfoResponse, AskRequest, AskResponse
from app.services.agent_service import AgentService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/ask",
    response_model=AskResponse,
    summary="Ask the data agent (non-streaming, returns full response)",
)
def ask(
    payload: AskRequest,
    service: AgentService = Depends(get_agent_service),
) -> AskResponse:
    try:
        result = service.ask(payload.question)
    except Exception as exc:
        logger.exception("Agent call failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent call failed: {exc}",
        ) from exc
    return AskResponse(**result)


@router.post(
    "/ask/stream",
    summary="Ask the data agent and stream events as NDJSON",
    responses={200: {"content": {"application/x-ndjson": {}}}},
)
def ask_stream(
    payload: AskRequest,
    service: AgentService = Depends(get_agent_service),
):
    def generator():
        try:
            for event in service.ask_stream(payload.question):
                yield json.dumps(event, default=str) + "\n"
        except Exception as exc:
            logger.exception("Streaming agent call failed")
            yield json.dumps({"type": "error", "message": str(exc)}) + "\n"

    return StreamingResponse(generator(), media_type="application/x-ndjson")


@router.get(
    "/agent",
    response_model=AgentInfoResponse,
    summary="Fetch metadata about the configured data agent",
)
def agent_info(
    service: AgentService = Depends(get_agent_service),
) -> AgentInfoResponse:
    try:
        info = service.get_agent_info()
    except Exception as exc:
        logger.exception("Failed to load agent info")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not load agent: {exc}",
        ) from exc
    return AgentInfoResponse(**info)
