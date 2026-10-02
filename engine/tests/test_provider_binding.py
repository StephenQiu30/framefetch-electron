from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from test_model_reports import configured

from framefetch_desktop.models import Provider
from framefetch_desktop.protocol import Request


def test_provider_endpoint_changed_while_hash_pending_rejects_old_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = configured(tmp_path)

    async def exercise() -> None:
        entered = asyncio.Event()
        release = asyncio.Event()

        async def delayed(asset_id: str, **kwargs: Any) -> Any:
            entered.set()
            await release.wait()
            asset, location, details = engine.store.asset_record(asset_id)
            return asset, Path(location), details

        monkeypatch.setattr(engine, "available_asset", delayed)
        old_request = Request(
            jsonrpc="2.0",
            id=1,
            method="analysis.create",
            params={
                "asset_id": "asset",
                "provider_id": "provider",
                "skill": "screenplay-analysis",
                "api_key": "TEST_OLD_ENDPOINT_KEY",
                "expected_provider_base_url": "https://example.com/v1",
                "operation_id": "pending-old-endpoint",
            },
        )
        pending = asyncio.create_task(engine.dispatch(old_request))
        try:
            await asyncio.wait_for(entered.wait(), 0.5)
            # No HTTP: mutate the non-secret configuration while source validation waits.
            engine.store.upsert_provider(
                Provider(
                    id="provider",
                    label="Changed provider",
                    model="changed-model",
                    base_url="https://other.example/v1",
                    vision=False,
                )
            )
            release.set()
            with pytest.raises(ValueError, match="provider_endpoint_changed"):
                await pending
            assert engine.store.list_tasks() == []
            assert engine.secrets == {}
            assert (
                engine.store.connection.execute("SELECT COUNT(*) FROM analysis_steps").fetchone()[0]
                == 0
            )
        finally:
            release.set()
            await asyncio.gather(pending, return_exceptions=True)

    try:
        asyncio.run(exercise())
    finally:
        engine.store.close()
