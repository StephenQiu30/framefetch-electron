from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import Field, StrictInt, StrictStr

from .models import DTO

MAX_MESSAGE = 1024 * 1024


class Request(DTO):
    jsonrpc: Literal["2.0"]
    id: StrictStr | StrictInt
    method: str = Field(min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)


def decode_request(data: bytes) -> Request:
    if len(data) > MAX_MESSAGE:
        raise ValueError("message_too_large")
    try:
        request = Request.model_validate_json(data)
    except ValueError as exc:
        raise ValueError("invalid_request") from exc
    if isinstance(request.id, bool):
        raise ValueError("invalid_request")
    return request


def encode(message: dict[str, Any]) -> bytes:
    encoded = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_MESSAGE:
        raise ValueError("result_too_large")
    return encoded + b"\n"


def response(request_id: str | int | None, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def error(request_id: str | int | None, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
