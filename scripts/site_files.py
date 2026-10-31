"""Copy source assets to a build directory while keeping existing public URLs."""
from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parent.parent

def copy_runtime(destination):
    for folder in ['css', 'js']:
        for source in (ROOT/'src'/folder).iterdir():
            if source.is_file():shutil.copy2(source, destination/source.name)
