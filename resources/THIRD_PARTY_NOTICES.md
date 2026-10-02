# Runtime third-party notices

The application invokes these executables as separate child processes. It does
not link its Electron or Python application code against FFmpeg libraries.
Versions and original download SHA-256 values are fixed in
`runtime-sources.lock.json`. Final installed bytes are hashed in runtime's
`manifest.json`; code signing can change those bytes.

## FFmpeg 8.0.1 and zlib 1.3.1

This software uses FFmpeg under LGPL-2.1-or-later. The FFmpeg source is unmodified
and is included at `licenses/ffmpeg/ffmpeg-8.0.1.tar.xz`, with its copyright and
license texts. Its upstream source is
<https://ffmpeg.org/releases/ffmpeg-8.0.1.tar.xz>. The detached upstream signature
is retained; the initial local build verified the pinned SHA-256 over HTTPS,
not its PGP signature. The FFmpeg release signer fingerprint is
FCF986EA15E6E293A5644F10B4322F04D67658D8.

The complete configure arguments, compiler identification and build status are
included in `licenses/ffmpeg/BUILD.json`. FFmpeg's own libraries are static
inside its executables. External library autodetection, GPL, version3 and nonfree
components are disabled; x264/x265, OpenSSL and other external codecs are not
included. Networking is disabled in FFmpeg; the downloader owns network I/O.
Only the OS runtime libraries are loaded dynamically on macOS. The Windows
build uses a static MinGW runtime and must pass a clean Windows execution check
before Windows support is accepted.

zlib is built statically from its unmodified official source to support PNG
encoding/decoding. The matching source archive, copyright and Zlib license are
included at `licenses/zlib/`. Its upstream source is
<https://zlib.net/fossils/zlib-1.3.1.tar.gz>. No system/Homebrew zlib is selected.

Build commands are implemented in `scripts/prepare-runtime.mjs`: extract both
pinned source archives, build zlib static, configure FFmpeg with the recorded
arguments, and `make -j4 ffmpeg ffprobe`. macOS requires Xcode command-line build
tools; Windows requires MSYS2 MinGW64 GCC and GNU make on the build machine.
Those build tools are not installation or application runtime dependencies.

For external distribution, publish these exact corresponding source archives
beside the installer and retain these notices; do not replace source with a
link to an unrelated latest release. The FFmpeg license guidance is at
<https://ffmpeg.org/legal.html>.

## yt-dlp 2026.08.19

The official PyInstaller executable includes Python and its required libraries;
it does not use system Python. yt-dlp itself is Unlicense, while the shipped
dependency code has separate licenses. The full upstream consolidated license
document at commit 3a08beaf031ab68f966401ead017ac81fe8486cf is included as
`licenses/YT-DLP-THIRD-PARTY-LICENSES.txt`. It covers bundled Python, OpenSSL,
certifi, requests, urllib3, brotli, websockets, mutagen, curl_cffi and yt-dlp-ejs
where present; the document is authoritative for the selected upstream binary.
Source and build scripts are at
<https://github.com/yt-dlp/yt-dlp/tree/3a08beaf031ab68f966401ead017ac81fe8486cf>.
Original executable hashes come from the upstream release SHA2-256SUMS.
Self-update, user configuration and untrusted plugins are disabled by the
application's invocation policy. EJS is bundled in this upstream executable;
resources alone do not constitute real YouTube download acceptance.

## Deno 2.9.7

Deno is MIT licensed. Its license is retained at `licenses/DENO-LICENSE.md`.
The exact upstream Cargo.lock, Cargo.toml and Rust toolchain file are retained
alongside it to identify the Rust and V8 dependency versions. Source and build
scripts are at <https://github.com/denoland/deno/tree/v2.9.7>. Deno's CLI does not
emit a consolidated dependency license document. A complete V8/Rust dependency
notice audit remains a formal external release gate; the manifest records it
as pending and this internal package does not claim that audit is complete.
Original archive hashes are the upstream immutable GitHub release asset hashes.

## Frozen Python engine

Python 3.12.13, uv 0.11.32, PyInstaller 6.17.0, Pydantic and the other locked engine dependencies
are selected through `engine/uv.lock`. The freeze script retains their installed
distribution licenses under `licenses/python/` together with Python's license
and an exact dependency inventory. PyInstaller's bootloader exception permits
bundling an application; its license text is retained with the build tool
inventory. The Python engine is built separately on every native target.
python-docx's document templates and certifi's CA bundle are explicitly collected
by the freeze script. The inventory includes the exact installed development
and runtime distributions; the presence of a build-tool license does not imply
its entire package is shipped. Python native libraries and wheels still require
execution on each supported OS, including the declared minimum macOS baseline.

This initial package is for internal testing. No formal code signature,
notarization, Gatekeeper or SmartScreen acceptance is claimed.
