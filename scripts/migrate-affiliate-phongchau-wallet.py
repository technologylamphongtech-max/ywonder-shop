import sqlite3,sys

db=sqlite3.connect(sys.argv[1],timeout=30)
with db:
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='MarketAffiliatePoolShare'").fetchone():
        raise RuntimeError('Run the Phong Chau pool migrations first')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliatePoolWithdrawalWindow(
      period TEXT PRIMARY KEY,opened INTEGER NOT NULL DEFAULT 0 CHECK(opened IN (0,1)),
      updatedBy TEXT NOT NULL,updated BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS MarketAffiliatePoolWithdrawal(
      id TEXT PRIMARY KEY,shareId TEXT NOT NULL UNIQUE,beneficiaryId TEXT NOT NULL,
      bankName TEXT NOT NULL,bankAccount TEXT NOT NULL,accountName TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','PAID')),
      payoutId TEXT,created BIGINT NOT NULL,paidAt BIGINT
    );
    CREATE INDEX IF NOT EXISTS MarketAffiliatePoolWithdrawal_user
      ON MarketAffiliatePoolWithdrawal(beneficiaryId,created);
    ''')
print('Phong Chau shared-wallet migration complete')
