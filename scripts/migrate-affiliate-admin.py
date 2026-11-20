import sqlite3,sys
db=sqlite3.connect(sys.argv[1],timeout=30)
columns={row[1] for row in db.execute('PRAGMA table_info(MarketAffiliateCommission)')}
if not columns: raise RuntimeError('Affiliate base migration must run first')
with db:
    for name,kind in [('payoutId','TEXT'),('paidAt','BIGINT'),('paidBy','TEXT')]:
        if name not in columns: db.execute(f'ALTER TABLE MarketAffiliateCommission ADD COLUMN {name} {kind}')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliatePayout(id TEXT PRIMARY KEY,requestId TEXT NOT NULL UNIQUE,beneficiaryId TEXT NOT NULL,amountVnd INTEGER NOT NULL CHECK(amountVnd>0),reference TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',createdBy TEXT NOT NULL,created BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS MarketAffiliatePayout_user ON MarketAffiliatePayout(beneficiaryId,created);
    CREATE INDEX IF NOT EXISTS MarketAffiliateCommission_payout ON MarketAffiliateCommission(payoutId);
    CREATE TABLE IF NOT EXISTS MarketAffiliateStoreAudit(id TEXT PRIMARY KEY,storeId TEXT NOT NULL,previousReferrerId TEXT,newReferrerId TEXT,reason TEXT NOT NULL,actorId TEXT NOT NULL,created BIGINT NOT NULL);
    ''')
print('Affiliate admin migration complete')
