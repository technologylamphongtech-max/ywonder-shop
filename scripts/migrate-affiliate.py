import sqlite3,sys
db=sqlite3.connect(sys.argv[1],timeout=30)
with db:
    columns={row[1] for row in db.execute('PRAGMA table_info(MarketStore)')}
    if 'affiliateReferrerId' not in columns:
        db.execute('ALTER TABLE MarketStore ADD COLUMN affiliateReferrerId TEXT')
        db.execute('UPDATE MarketStore SET affiliateReferrerId=(SELECT referredById FROM User WHERE User.id=MarketStore.userId)')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliateOrder(orderId TEXT PRIMARY KEY,created BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS MarketAffiliateOrderChain(orderId TEXT NOT NULL,level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 9),beneficiaryId TEXT NOT NULL,PRIMARY KEY(orderId,level),UNIQUE(orderId,beneficiaryId));
    CREATE TABLE IF NOT EXISTS MarketAffiliateOrderBusiness(orderId TEXT NOT NULL,storeId TEXT NOT NULL,beneficiaryId TEXT NOT NULL,PRIMARY KEY(orderId,storeId));
    CREATE TABLE IF NOT EXISTS MarketAffiliateCommission(id TEXT PRIMARY KEY,orderId TEXT NOT NULL,beneficiaryId TEXT NOT NULL,sourceUserId TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('BUSINESS','CONNECTION')),level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 9),sourceKey TEXT NOT NULL,revenue INTEGER NOT NULL CHECK(revenue>=0),rateBps INTEGER NOT NULL CHECK(rateBps BETWEEN 0 AND 10000),amount INTEGER NOT NULL CHECK(amount>0),currency TEXT NOT NULL DEFAULT 'VND' CHECK(currency='VND'),status TEXT NOT NULL DEFAULT 'ACCRUED' CHECK(status IN ('ACCRUED','PAID')),created BIGINT NOT NULL,UNIQUE(orderId,kind,level,sourceKey));
    CREATE INDEX IF NOT EXISTS MarketAffiliateCommission_user ON MarketAffiliateCommission(beneficiaryId,created);
    ''')
print('Affiliate migration complete')
