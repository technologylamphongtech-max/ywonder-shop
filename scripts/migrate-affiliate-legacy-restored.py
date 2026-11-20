"""Mark the cutover after which standard Shop affiliate accrual resumes."""
import sqlite3
import sys
import time

with sqlite3.connect(sys.argv[1], timeout=30) as db:
    db.execute("INSERT OR IGNORE INTO MarketSetting(key,value) VALUES('affiliate:legacy-restored:effective',?)", (str(int(time.time() * 1000)),))
print('Standard Shop affiliate cutover ready')
