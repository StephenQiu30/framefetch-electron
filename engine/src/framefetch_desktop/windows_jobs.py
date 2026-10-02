from __future__ import annotations

import ctypes
import os
from typing import Any, cast

DWORD = ctypes.c_uint32
SIZE_T = ctypes.c_size_t
HANDLE = ctypes.c_void_p


class BasicLimitInformation(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", DWORD),
        ("MinimumWorkingSetSize", SIZE_T),
        ("MaximumWorkingSetSize", SIZE_T),
        ("ActiveProcessLimit", DWORD),
        ("Affinity", SIZE_T),
        ("PriorityClass", DWORD),
        ("SchedulingClass", DWORD),
    ]


class IOCounters(ctypes.Structure):
    _fields_ = [
        (name, ctypes.c_uint64)
        for name in [
            "ReadOperationCount",
            "WriteOperationCount",
            "OtherOperationCount",
            "ReadTransferCount",
            "WriteTransferCount",
            "OtherTransferCount",
        ]
    ]


class ExtendedLimitInformation(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", BasicLimitInformation),
        ("IoInfo", IOCounters),
        ("ProcessMemoryLimit", SIZE_T),
        ("JobMemoryLimit", SIZE_T),
        ("PeakProcessMemoryUsed", SIZE_T),
        ("PeakJobMemoryUsed", SIZE_T),
    ]


class AccountingInformation(ctypes.Structure):
    _fields_ = [
        ("TotalUserTime", ctypes.c_int64),
        ("TotalKernelTime", ctypes.c_int64),
        ("ThisPeriodTotalUserTime", ctypes.c_int64),
        ("ThisPeriodTotalKernelTime", ctypes.c_int64),
        ("TotalPageFaultCount", DWORD),
        ("TotalProcesses", DWORD),
        ("ActiveProcesses", DWORD),
        ("TotalTerminatedProcesses", DWORD),
    ]


class WindowsJob:
    """One nested job per worker; the coordinator retains and closes its handle.

    Assign before writing the worker's initial task frame. Until then the worker
    waits on stdin, so no tool can escape assignment through a spawn race.
    """

    def __init__(self, pid: int, *, kernel: Any = None) -> None:
        if kernel is None:
            if os.name != "nt":
                raise ValueError("windows_job_unavailable")
            kernel = cast(Any, ctypes).WinDLL("kernel32", use_last_error=True)
            declarations = [
                ("CreateJobObjectW", [ctypes.c_void_p, ctypes.c_wchar_p], HANDLE),
                (
                    "SetInformationJobObject",
                    [HANDLE, ctypes.c_int, ctypes.c_void_p, DWORD],
                    ctypes.c_int,
                ),
                ("OpenProcess", [DWORD, ctypes.c_int, DWORD], HANDLE),
                ("AssignProcessToJobObject", [HANDLE, HANDLE], ctypes.c_int),
                ("TerminateJobObject", [HANDLE, ctypes.c_uint], ctypes.c_int),
                (
                    "QueryInformationJobObject",
                    [HANDLE, ctypes.c_int, ctypes.c_void_p, DWORD, ctypes.c_void_p],
                    ctypes.c_int,
                ),
                ("CloseHandle", [HANDLE], ctypes.c_int),
            ]
            for name, arguments, result in declarations:
                function = getattr(kernel, name)
                function.argtypes = arguments
                function.restype = result
        self.kernel = kernel
        self.handle: Any = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise ValueError("windows_job_creation_failed")
        process = None
        try:
            information = ExtendedLimitInformation()
            information.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
            if not self.kernel.SetInformationJobObject(
                self.handle, 9, ctypes.byref(information), ctypes.sizeof(information)
            ):
                raise ValueError("windows_job_configuration_failed")
            process = self.kernel.OpenProcess(0x0100 | 0x0001, False, pid)  # SET_QUOTA | TERMINATE
            if not process or not self.kernel.AssignProcessToJobObject(self.handle, process):
                raise ValueError("windows_job_assignment_failed")
        except BaseException:
            self.close()
            raise
        finally:
            if process:
                self.kernel.CloseHandle(process)

    def terminate(self) -> None:
        if self.handle and not self.kernel.TerminateJobObject(self.handle, 1):
            raise ValueError("windows_job_termination_failed")

    def active_processes(self) -> int:
        information = AccountingInformation()
        if not self.handle or not self.kernel.QueryInformationJobObject(
            self.handle, 1, ctypes.byref(information), ctypes.sizeof(information), None
        ):
            raise ValueError("windows_job_query_failed")
        return int(information.ActiveProcesses)

    def close(self) -> None:
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None
