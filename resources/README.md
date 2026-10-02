# Reproducible internal runtime

Run these commands from this project on the native target:

```sh
pnpm install --frozen-lockfile
pnpm contract:generate
node scripts/prepare-runtime.mjs
node scripts/freeze-engine.mjs
node scripts/verify-runtime.mjs
pnpm build
pnpm exec electron-builder --mac --arm64 --dir --publish never
```

Use `--mac --x64` on Intel macOS, or `--win --x64` on Windows. Windows first
requires `node scripts/build-native.mjs` on a machine with Visual Studio C++
build tools, plus MSYS2 at `C:/msys64` containing MinGW64 GCC and GNU make.
An alternate MSYS2 installation can be passed to prepare-runtime using
`--msys2-root <directory>`. The addon uses the project's exact Electron version.

The source lock fixes FFmpeg, zlib, yt-dlp, Deno and engine build versions.
Original archive hashes are checked before extraction. FFmpeg and zlib are
built from source with four jobs; final tools have no Homebrew dynamic-library
dependency. Build-machine compilers are identified in the installed build record.
The frozen engine is copied in full, including Python dynamic libraries,
python-docx templates and certifi data. Freeze dereferences internal symlinks;
runtime verification rejects symlinks, unlisted files and wrong native binaries.

Each OS/architecture has its own ignored `runtime/<platform>-<arch>/` directory.
Builder copies only the selected target into its final `runtime` directory.
Production paths are relative to `process.resourcesPath/runtime`; neither
source checkout paths nor system Python/FFmpeg are application dependencies.

`prepare-runtime --minimal` intentionally omits yt-dlp and Deno and sets download
resource capability false. A failed download otherwise aborts preparation; it
does not silently package a partial downloader. No browser or model weights are
included. EJS is included by the selected official yt-dlp executable.

The default build is an unsigned internal package. A future release can supply
an explicit macOS signing identity or Windows signtool configuration: afterPack
signs nested resources, writes the final byte hashes, and then builder signs the
outer application. macOS signIgnore protects runtime from later mutation;
afterSign verifies without writing. Notarization, Windows publisher identity,
Gatekeeper and clean installation are separate unverified release gates.
`hash-installers.mjs` writes installer hashes outside the application.

Local evidence on 2026-10-02 (macOS 27.0.1 arm64): prepare, onedir freeze, resource
hash/architecture checks, frozen engine hello/shutdown, explicit FFmpeg/ffprobe,
Chinese/space path MP4 probe, PNG extraction and full decode all passed with
empty PATH. yt-dlp 2026.08.19 reports bundled EJS 0.8.0 and explicit Deno 2.9.7
without external component downloads. The runtime was approximately 220 MiB.
FFmpeg's minimum deployment version is 14.0; running on macOS 14 has not been
tested. Windows and Intel packages/installation have not been tested locally.
The controller owns the final engine refresh and packaged Electron E2E evidence.

Full FFmpeg/zlib corresponding source archives and licenses ship in runtime.
The exact upstream yt-dlp consolidated licenses ship as well. Deno's MIT license
and dependency lock are retained, with its complete V8/Rust dependency notice
audit explicitly pending before external distribution. See THIRD_PARTY_NOTICES.md.
