import sqlite3
import subprocess
import sys
from pathlib import Path

path = Path(sys.argv[1]).resolve()
base = Path(__file__).resolve().parent
scripts = base.parent / 'scripts'
subprocess.run([sys.executable, str(base / 'store-affiliate-selection-fixture.py'), str(path)], check=True)
subprocess.run([sys.executable, str(scripts / 'migrate-phongchau-shop-only.py'), str(path)], check=True)
subprocess.run([sys.executable, str(scripts / 'migrate-affiliate-admin.py'), str(path)], check=True)
subprocess.run([sys.executable, str(scripts / 'migrate-affiliate-legacy-restored.py'), str(path)], check=True)
with sqlite3.connect(path) as db:
    db.execute("UPDATE MarketSetting SET value='2000' WHERE key='affiliate:legacy-restored:effective'")
    db.execute("UPDATE User SET referredById='b' WHERE id='a'")
print('Affiliate restored fixture ready')
