import sqlite3,sys

db=sqlite3.connect(sys.argv[1],timeout=30)
with db:
    month_columns={row[1] for row in db.execute('PRAGMA table_info(MarketAffiliatePoolMonth)')}
    share_columns={row[1] for row in db.execute('PRAGMA table_info(MarketAffiliatePoolShare)')}
    if not month_columns or not share_columns:raise RuntimeError('Run the Phong Chau pool migration first')
    if 'groupCount' not in month_columns:
        db.execute('ALTER TABLE MarketAffiliatePoolMonth ADD COLUMN groupCount INTEGER NOT NULL DEFAULT 0')
    for name,kind in [('groupId','TEXT'),('referrerId','TEXT'),('orderCount','INTEGER'),('orderRevenue','INTEGER'),('weight','TEXT'),('shareBps','INTEGER'),('qualifiedAt','BIGINT')]:
        if name not in share_columns:db.execute(f'ALTER TABLE MarketAffiliatePoolShare ADD COLUMN {name} {kind}')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS MarketAffiliatePoolGroup(
      id TEXT PRIMARY KEY,poolId TEXT NOT NULL,referrerId TEXT NOT NULL,
      groupNumber INTEGER NOT NULL,memberCount INTEGER NOT NULL CHECK(memberCount=10),
      poolAmount INTEGER NOT NULL CHECK(poolAmount>=0),created BIGINT NOT NULL,
      UNIQUE(poolId,referrerId,groupNumber)
    );
    CREATE INDEX IF NOT EXISTS MarketAffiliatePoolGroup_pool ON MarketAffiliatePoolGroup(poolId);
    CREATE INDEX IF NOT EXISTS MarketAffiliatePoolShare_group ON MarketAffiliatePoolShare(groupId);
    ''')
print('Phong Chau grouped pool migration complete')
