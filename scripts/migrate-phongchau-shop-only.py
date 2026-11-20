"""Give Phong Châu F1 members Shop-only referral codes."""
import secrets
import sqlite3
import sys
import time

db = sqlite3.connect(sys.argv[1], timeout=30)
with db:
    columns = {row[1] for row in db.execute('PRAGMA table_info(MarketStoreF1)')}
    if 'shopRefCode' not in columns:
        db.execute('ALTER TABLE MarketStoreF1 ADD COLUMN shopRefCode TEXT')
    db.execute('CREATE UNIQUE INDEX IF NOT EXISTS MarketStoreF1_shopRefCode ON MarketStoreF1(shopRefCode)')
    for store_id, user_id in db.execute('SELECT storeId,userId FROM MarketStoreF1 WHERE shopRefCode IS NULL OR shopRefCode=""').fetchall():
        db.execute('UPDATE MarketStoreF1 SET shopRefCode=? WHERE storeId=? AND userId=?', ('pc_' + secrets.token_hex(12), store_id, user_id))
    db.execute("INSERT OR IGNORE INTO MarketSetting(key,value) VALUES('affiliate:phongchau:shop-only:effective',?)", (str(int(time.time() * 1000)),))
print('Phong Chau Shop-only referral migration complete')
