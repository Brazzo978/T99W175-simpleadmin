from pathlib import Path
import base64
import io
import zipfile

from remote_admin_embedded import ASSET_ARCHIVE_B64  # importa l'archivio embedded

def main() -> None:
    data = base64.b64decode(ASSET_ARCHIVE_B64)

    outdir = Path("simpleadmin_assets")
    outdir.mkdir(exist_ok=True)

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(outdir)

    print("File estratti in:", outdir.resolve())

if __name__ == "__main__":
    main()
