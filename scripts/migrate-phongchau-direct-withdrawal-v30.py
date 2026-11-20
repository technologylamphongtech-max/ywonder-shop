import sqlite3,sys
from pathlib import Path

p=Path(sys.argv[1]);assert p.is_file(),p
with sqlite3.connect(p,timeout=30) as db:
 db.execute('PRAGMA busy_timeout=30000')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS MarketAffiliateDirectWithdrawal(
   id TEXT PRIMARY KEY,
   commissionId TEXT NOT NULL UNIQUE,
   beneficiaryId TEXT NOT NULL,
   bankName TEXT NOT NULL,
   bankAccount TEXT NOT NULL,
   accountName TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','PAID')),
   payoutId TEXT,
   created BIGINT NOT NULL,
   paidAt BIGINT
 );
 CREATE INDEX IF NOT EXISTS MarketAffiliateDirectWithdrawal_user ON MarketAffiliateDirectWithdrawal(beneficiaryId,created);
 ''')
 db.commit()
print('Phong Chau direct withdrawal schema ready')
