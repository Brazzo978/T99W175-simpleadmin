from pathlib import Path
import base64
import io
import zipfile

# Cartella con i file estratti/modificati
ASSETS_DIR = Path("simpleadmin_assets")

def build():
    if not ASSETS_DIR.is_dir():
        raise SystemExit(f"Directory {ASSETS_DIR} non trovata")

    buf = io.BytesIO()

    # Crea lo zip in memoria
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path in ASSETS_DIR.rglob("*"):
            if path.is_file():
                # percorso relativo dentro lo zip
                arcname = path.relative_to(ASSETS_DIR).as_posix()
                z.write(path, arcname)

    # codifica tutto in base64
    data_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # spezzetta su più righe per leggibilità
    line_len = 76
    chunks = [data_b64[i:i+line_len] for i in range(0, len(data_b64), line_len)]

    print("ASSET_ARCHIVE_B64 = (")
    for ch in chunks:
        print(f"    '{ch}'")
    print(")")

if __name__ == "__main__":
    build()
