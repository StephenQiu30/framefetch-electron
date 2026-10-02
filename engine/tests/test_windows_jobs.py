from __future__ import annotations

import ctypes
from typing import Any

import pytest

from framefetch_desktop.windows_jobs import (
    AccountingInformation,
    ExtendedLimitInformation,
    WindowsJob,
)


class Kernel:
    def __init__(self, *, assign: bool = True) -> None:
        self.assigned = assign
        self.calls: list[str] = []
        self.flags = 0

    def CreateJobObjectW(self, security: Any, name: Any) -> int:
        assert security is None and name is None  # Default non-inheritable handle.
        self.calls.append("create")
        return 100

    def SetInformationJobObject(self, handle: int, kind: int, pointer: Any, length: int) -> bool:
        assert kind == 9 and length == ctypes.sizeof(ExtendedLimitInformation)
        self.flags = ctypes.cast(
            pointer, ctypes.POINTER(ExtendedLimitInformation)
        ).contents.BasicLimitInformation.LimitFlags
        self.calls.append("limit")
        return True

    def OpenProcess(self, access: int, inherit: bool, pid: int) -> int:
        assert inherit is False and pid == 123
        self.calls.append("open")
        return 200

    def AssignProcessToJobObject(self, job: int, process: int) -> bool:
        self.calls.append("assign")
        return self.assigned

    def TerminateJobObject(self, handle: int, code: int) -> bool:
        self.calls.append("terminate")
        return True

    def QueryInformationJobObject(
        self, handle: int, kind: int, pointer: Any, length: int, returned: Any
    ) -> bool:
        assert kind == 1
        ctypes.cast(pointer, ctypes.POINTER(AccountingInformation)).contents.ActiveProcesses = 0
        self.calls.append("query")
        return True

    def CloseHandle(self, handle: int) -> bool:
        self.calls.append("close-" + str(handle))
        return True


def test_windows_per_worker_job_is_non_inherited_kill_on_close_and_queryable() -> None:
    kernel = Kernel()
    job = WindowsJob(123, kernel=kernel)
    assert kernel.flags & 0x2000
    assert kernel.calls[:4] == ["create", "limit", "open", "assign"]
    job.terminate()
    assert job.active_processes() == 0
    job.close()
    job.close()
    assert kernel.calls.count("close-100") == 1


def test_windows_assignment_failure_closes_job_and_prevents_task_start() -> None:
    kernel = Kernel(assign=False)
    with pytest.raises(ValueError, match="windows_job_assignment_failed"):
        WindowsJob(123, kernel=kernel)
    assert "close-100" in kernel.calls and "close-200" in kernel.calls
