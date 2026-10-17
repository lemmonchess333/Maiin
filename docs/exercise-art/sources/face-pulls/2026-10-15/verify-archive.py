"""Verify exact archived candidate using relative files and the original helper.

Evidence .json.txt/.mts.txt names protect original bytes from normal formatting.
Only a temporary copy restores original filenames; this archive is read-only.
Requires Python, Pillow and NumPy. Usage: python verify-archive.py
"""
from pathlib import Path
from hashlib import sha256
import json
import shutil
import subprocess
import sys
import tempfile

root=Path(__file__).resolve().parent
rows=json.loads((root/'candidate-payload-index.json.txt').read_bytes())['rows']
scratch_base=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd().resolve()
assert scratch_base.is_dir()
with tempfile.TemporaryDirectory(prefix='face-pulls-source-verify-',dir=scratch_base) as temporary:
    target=Path(temporary).resolve()
    assert target.parent==scratch_base
    assert target.name.startswith('face-pulls-source-verify-')
    for row in rows:
        source=(root/row['archivePath']).resolve()
        destination=(target/row['originalPath']).resolve()
        assert source.is_relative_to(root) and destination.is_relative_to(target)
        assert sha256(source.read_bytes()).hexdigest()==row['sha256'],row['archivePath']
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,destination)
    result=subprocess.run([sys.executable,str(target/'reproduce.py'),'--verify'],cwd=target)
    if result.returncode:raise SystemExit(result.returncode)
print(json.dumps({'status':'exact-source-archive-reproduction-verified-not-release-acceptance','payloadFiles':len(rows),'archiveUnmodified':True}),flush=True)
