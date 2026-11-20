"""Freeze Phong Chau affiliate permission on each new order."""
import sqlite3
import sys

db = sqlite3.connect(sys.argv[1], timeout=30)
with db:
    assert db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='MarketStoreF1'").fetchone(), 'Run store F1 migration first'
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliateOrderPhongChau (
      orderId TEXT PRIMARY KEY,
      beneficiaryId TEXT NOT NULL,
      created BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS MarketAffiliateOrderPhongChau_beneficiary ON MarketAffiliateOrderPhongChau(beneficiaryId);
    ''')
    # Existing unpaid orders retain the affiliate terms in force when placed.
    db.execute('''
      INSERT OR IGNORE INTO MarketAffiliateOrderPhongChau(orderId,beneficiaryId,created)
      SELECT DISTINCT chain.orderId,chain.beneficiaryId,affiliate.created
      FROM MarketAffiliateOrderChain chain
      JOIN MarketAffiliateOrder affiliate ON affiliate.orderId=chain.orderId
      JOIN MarketOrder orders ON orders.id=chain.orderId
      JOIN MarketOrderItem item ON item.orderId=chain.orderId
      WHERE chain.level=1 AND item.storeId=?
        AND orders.status NOT IN ('COMPLETED','CANCELLED')
        AND affiliate.created>=COALESCE((SELECT CAST(value AS INTEGER) FROM MarketSetting WHERE key='affiliate:phongchau:effective'),9223372036854775807)
    ''', ('70297741-e78b-4ef9-b659-80fc513330a8',))
print('Phong Chau affiliate order snapshot migration complete')
