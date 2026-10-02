# Windows engine supervision

`job.cc` is a small N-API adapter. Build it on the Windows x64 runner with Electron's headers using `node-gyp rebuild --directory resources/native --target 44.5.1 --arch x64 --dist-url https://electronjs.org/headers`, then copy `build/Release/job.node` to `resources/runtime/win32-x64/native/job.node` before calculating the final runtime manifest.

Main owns a non-inheritable Job Object handle with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. The coordinator does not spawn workers until Main has assigned it to the job and sent `engine.hello({supervised:true})`. Closing the handle terminates the job subtree. There is no `taskkill` fallback.

This source has not been compiled or runtime verified on the current macOS host. The Windows CI and installed Windows application must prove assignment, coordinator/worker crash cleanup, Main crash cleanup, native loading and architecture before Windows acceptance.
