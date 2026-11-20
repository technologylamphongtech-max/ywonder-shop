import sqlite3,sys

db=sqlite3.connect(sys.argv[1],timeout=30)
with db:
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='MarketOrder'").fetchone():
        raise RuntimeError('Run the Shop base migration first')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketOrderBankPayment(
      orderId TEXT PRIMARY KEY REFERENCES MarketOrder(id),
      bankName TEXT NOT NULL,bankCode TEXT NOT NULL,accountNumber TEXT NOT NULL,
      accountName TEXT NOT NULL,amountVnd INTEGER NOT NULL CHECK(amountVnd>0),
      transferMemo TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'AWAITING' CHECK(status IN ('AWAITING','VERIFIED','CANCELLED')),
      reference TEXT UNIQUE,verifiedBy TEXT,verifiedAt BIGINT,created BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS MarketOrderBankPayment_status ON MarketOrderBankPayment(status,created);
    ''')
print('Shop bank payment migration complete')
