# FrameFetch application icon

First-party artwork: a white filmstrip on a blue rounded square. The blue
`#336bdf` matches the renderer's brand mark. No external artwork or font is used.

Recreate all formats with Python and Pillow 12.3.0:

```sh
python3 scripts/generate-icons.py
```

`icon.svg` is the vector source, `icon-512.png` and `icon-1024.png` are transparent
PNG exports, `icon.icns` contains macOS icon representations, and `icon.ico`
contains Windows sizes 16, 24, 32, 48, 64, 128 and 256. These are product assets;
the generator and Pillow are not application runtime dependencies.
