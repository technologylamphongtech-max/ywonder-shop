import sqlite3
import sys

path=sys.argv[1] if len(sys.argv)>1 else '/var/www/ywonder/prisma/prisma/prod.db'
db=sqlite3.connect(path,timeout=30)
db.execute('PRAGMA busy_timeout=30000')
with db:
    db.execute('''CREATE TABLE IF NOT EXISTS MarketWithdrawalKyc(
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      detailsCipher TEXT NOT NULL,
      frontCipher TEXT NOT NULL,
      backCipher TEXT NOT NULL,
      submittedAt BIGINT NOT NULL,
      reviewedAt BIGINT,
      reviewedBy TEXT,
      reviewNote TEXT
    )''')
    db.execute('CREATE INDEX IF NOT EXISTS MarketWithdrawalKycUserDate ON MarketWithdrawalKyc(userId,submittedAt DESC)')
    db.execute('CREATE INDEX IF NOT EXISTS MarketWithdrawalKycStatusDate ON MarketWithdrawalKyc(status,submittedAt DESC)')
assert db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='MarketWithdrawalKyc'").fetchone()[0]==1
print('Withdrawal KYC schema ready')
