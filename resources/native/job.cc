#include <node_api.h>
#ifdef _WIN32
#include <windows.h>

struct Job { HANDLE handle; };
static void Finalize(napi_env, void* data, void*) { Job* job = static_cast<Job*>(data); if (job->handle) CloseHandle(job->handle); delete job; }
static napi_value Create(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  uint32_t pid = 0;
  if (argc != 1 || napi_get_value_uint32(env, argv[0], &pid) != napi_ok || !pid) { napi_throw_error(env, nullptr, "Invalid engine PID"); return nullptr; }
  HANDLE handle = CreateJobObjectW(nullptr, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!handle || !SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0) || !SetInformationJobObject(handle, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    if (handle) CloseHandle(handle); napi_throw_error(env, nullptr, "Cannot create supervised engine job"); return nullptr;
  }
  HANDLE process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, pid);
  if (!process || !AssignProcessToJobObject(handle, process)) {
    if (process) CloseHandle(process); CloseHandle(handle); napi_throw_error(env, nullptr, "Cannot assign engine to supervised job"); return nullptr;
  }
  CloseHandle(process);
  Job* job = new Job{handle}; napi_value value;
  if (napi_create_external(env, job, Finalize, nullptr, &value) != napi_ok) { CloseHandle(handle); delete job; napi_throw_error(env, nullptr, "Cannot retain engine job"); return nullptr; }
  return value;
}
static napi_value Close(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr); Job* job = nullptr;
  if (argc != 1 || napi_get_value_external(env, argv[0], reinterpret_cast<void**>(&job)) != napi_ok || !job) { napi_throw_error(env, nullptr, "Invalid engine job"); return nullptr; }
  if (job->handle) { CloseHandle(job->handle); job->handle = nullptr; }
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {{"create", nullptr, Create, nullptr, nullptr, nullptr, napi_default, nullptr}, {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, 2, descriptors); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
#else
#error "The Job Object adapter must be built on Windows."
#endif
