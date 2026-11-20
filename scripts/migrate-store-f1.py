"""Link buyers directly to a store for store-level F1 pools."""
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1], timeout=30)
with db:
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketStoreF1 (
      storeId TEXT NOT NULL,
      userId TEXT NOT NULL,
      created BIGINT NOT NULL,
      PRIMARY KEY(storeId,userId)
    );
    CREATE INDEX IF NOT EXISTS MarketStoreF1_user ON MarketStoreF1(userId);
    ''')
print('Store F1 migration complete')
