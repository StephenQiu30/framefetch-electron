# Engine implementation ledger

Scope: docs/design/06 Task 1; only engine/ and contracts/engine.schema.json.

Ruling: parent coordinates shared setup, final review and commits; this agent does not alter public configuration or create another checkout.
Ruling: no original server imports; independent rules and first-party built-in Skill prompts keep runtime self-contained.
Pre-flight: main consumes direct DTOs/arrays and schema-generated TS. asset resolve paths stay main-only.
Tests written first: operation id/hash conflict, cancelled late commit, started model recovery, changed input snapshot, private destination rejection, malformed/oversize protocol.

Completed implementation:
- Version 1 JSON-RPC UTF-8 lines, 1 MiB bound, strict inputs, correlated capacity rejection, notification sequences.
- Coordinator-only SQLite owner, checksummed migration, WAL/FULL, idempotent operation/payload pairs, revisioned attempts, finite worker pools and recovery.
- Reference/copy MP4 and UTF-8 TXT/Markdown/Fountain, text PDF and DOCX imports. Streaming snapshots/hash, probe, local thumbnails, changed/missing checks.
- Current-attempt publication rights, generated paths, atomic no-clobber hardlink publication with file/directory sync, identity-bound intents and retired cleanup.
- POSIX worker groups with parent-stdin EOF supervision, real cancel and abrupt-exit subtree tests. Windows coordinator-owned nested per-worker Job Objects assigned before initial task input, kill-on-close, termination and ActiveProcesses confirmation.
- Anonymous Bilibili/YouTube candidates via bundled tools only, no config/plugins/remote components, public/clear protection checks, DNS-pinned proxy for every connection, native downloader, finite retries/timeouts and full decoded file verification.
- Explicit BYOK compatible API requests, bounded document/frame snapshots, built-in first-party Skills, strict structured result/evidence validation, committed started acknowledgement before network, unknown state without automatic resend, offline Markdown/DOCX reports.
- Schema contains business DTOs plus ImportInput/DownloadInput/ProviderInput/AnalysisInput; no parallel TS model source.

Verification (2026-10-02, macOS arm64):
- uv frozen dependency sync succeeded; Python 3.12.13, pinned pyproject and uv.lock.
- `uv run --project engine pytest -q`: 32 passed, including real bundled FFmpeg 8.0.1 offline MP4 import/hash/probe/thumbnail/full-decode and real stdio persistent document imports/restarts.
- `uv run --project engine ruff check engine` and strict mypy: passed.
- Critical review regressions observed RED then GREEN: repeated cancelled export cleanup; older active analysis behind 1001 later terminal tasks; snapshot target collision.
- POSIX real processes: task cancel, main stdin EOF, coordinator SIGKILL, worker SIGKILL each reclaimed a real tool and grandchild. Mock Provider transport proved started commit before request, persisted report, MD/DOCX export, timeout unknown/no resend; this is not real Provider acceptance.
- Provider/key endpoint binding regression observed RED then GREEN without HTTP: source hash validation waits, configuration changes A to B, pending A-key request is rejected after validation with provider_endpoint_changed before task/key persistence. Main-only expected_provider_base_url is required in AnalysisInput; it is compared exactly with the canonical current Provider snapshot.

Ruling: no-clobber hardlink then staging unlink replaces POSIX rename to avoid its overwrite race; source identity is preserved for ownership checks. APFS/NTFS durability and actual Windows Job execution still require installation-state acceptance.
Ruling: analysis retries require a new explicitly authorized analysis.create with a new operation id; tasks.retry never automatically submits model requests.
Ruling: displayed tasks/assets are at most 1000 items and UTF-8 response-budget bounded; reports list is at most 500 summaries with empty markdown and reports.get retrieves one full report. Older history pagination remains a later UI capability; recovery uses an independent unbounded active-task query.
Ruling: downloads/visual analysis share one heavy-media slot, imports/exports at most two active tasks, total workers at most four and inspections at most two. This is stricter than the initial concurrency targets while resource measurements remain open.

Not accepted: real Bilibili/YouTube downloads, real paid Provider calls, Windows/Intel installation and process behavior, >4 GiB media performance, formal signing/notarization, exFAT/network-volume durability. No secrets, original project services, sibling runtime imports or Git commits were used.
