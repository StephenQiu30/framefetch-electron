"""Extract one pinned upstream executable; never materialize other archive paths."""
from pathlib import Path
import shutil
import sys
import zipfile

archive, directory, name = sys.argv[1:]
if Path(name).name != name or name not in {"deno", "deno.exe"}:
    raise SystemExit("unexpected tool name")
with zipfile.ZipFile(archive) as bundle:
    member = bundle.getinfo(name)
    if member.is_dir() or member.file_size > 256 * 1024 * 1024:
        raise SystemExit("invalid tool archive")
    destination = Path(directory) / name
    with bundle.open(member) as source, destination.open("wb") as output:
        shutil.copyfileobj(source, output, 1024 * 1024)
