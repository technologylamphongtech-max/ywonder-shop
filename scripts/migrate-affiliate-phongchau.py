import sqlite3,sys

db=sqlite3.connect(sys.argv[1],timeout=30)
with db:
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliatePoolMonth(
      id TEXT PRIMARY KEY,storeId TEXT NOT NULL,period TEXT NOT NULL,
      revenue INTEGER NOT NULL CHECK(revenue>=0),rateBps INTEGER NOT NULL,
      poolAmount INTEGER NOT NULL CHECK(poolAmount>=0),eligibleCount INTEGER NOT NULL,
      closedBy TEXT NOT NULL,created BIGINT NOT NULL,
      UNIQUE(storeId,period)
    );
    CREATE TABLE IF NOT EXISTS MarketAffiliatePoolShare(
      id TEXT PRIMARY KEY,poolId TEXT NOT NULL,beneficiaryId TEXT NOT NULL,
      qualifiedF1 INTEGER NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),
      status TEXT NOT NULL DEFAULT 'ACCRUED' CHECK(status IN ('ACCRUED','PAID')),
      payoutId TEXT,paidAt BIGINT,paidBy TEXT,created BIGINT NOT NULL,
      UNIQUE(poolId,beneficiaryId)
    );
    CREATE INDEX IF NOT EXISTS MarketAffiliatePoolShare_user ON MarketAffiliatePoolShare(beneficiaryId,created);
    ''')
    db.execute("INSERT OR IGNORE INTO MarketSetting(key,value) VALUES('affiliate:phongchau:effective',?)",(str(int(__import__('time').time()*1000)),))
print('Phong Chau affiliate migration complete')
