# FrameFetch application icon

The canonical brand is `video-server/frontend/public/logo.svg` and `logo.png`:
the original blue download arrow and play symbol. The renderer uses verbatim
local copies in `src/renderer/assets/`. The SVG is not redrawn, recolored or
filtered. PNG exports preserve transparency and scale without stretching.

Update from the frontend only when intentionally synchronizing its brand:

```sh
node scripts/sync-brand.mjs --source ../video-server/frontend
```

This copies the two originals and generates PNG 512/1024, macOS ICNS and Windows
ICO (16, 24, 32, 48, 64, 128 and 256). The generator requires build-time Python
and Pillow 12.3.0, resolved by `uv`; they are not renderer runtime dependencies.

Check the committed local assets offline, without the sibling repository:

```sh
node scripts/sync-brand.mjs --check
```

Check whether the frontend originals have changed without modifying files:

```sh
node scripts/sync-brand.mjs --check --source ../video-server/frontend
```

`brand-manifest.json` records the source paths and SHA-256 hashes, generator
version/hash and generated artifacts. The application SVG matches the local
original byte-for-byte. The 1024px PNG also matches the current original bytes.
Recreate exports from only the local originals with:

```sh
uv run --no-project --with pillow==12.3.0 python scripts/generate-icons.py
```

Application builds and runtime use checked-in assets and do not read the sibling
frontend. `tests/packaging/brand.test.mjs` verifies provenance and detects source
or generated icon drift using Node's built-in test runner.
