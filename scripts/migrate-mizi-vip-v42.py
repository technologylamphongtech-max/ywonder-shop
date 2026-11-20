import sqlite3, sys, time

if len(sys.argv)!=2:
 raise SystemExit('Usage: migrate-mizi-vip-v42.py /path/to/prod.db')

db=sqlite3.connect(sys.argv[1],timeout=30)
try:
 db.execute('PRAGMA busy_timeout=30000')
 db.execute('BEGIN IMMEDIATE')
 db.execute('''CREATE TABLE IF NOT EXISTS MarketMiziVipQualification(
  id TEXT PRIMARY KEY,userId TEXT NOT NULL,orderId TEXT NOT NULL UNIQUE,
  qualifiedAt BIGINT NOT NULL,expiresAt BIGINT NOT NULL,
  qualifyingF1Sales BIGINT NOT NULL,created BIGINT NOT NULL)''')
 db.execute('CREATE INDEX IF NOT EXISTS MarketMiziVipQualification_user ON MarketMiziVipQualification(userId,qualifiedAt,expiresAt)')
 db.execute('''CREATE TABLE IF NOT EXISTS MarketMiziVipPoolMonth(
  period TEXT PRIMARY KEY,revenue BIGINT NOT NULL,rateBps INTEGER NOT NULL,
  poolAmount BIGINT NOT NULL,distributedAmount BIGINT NOT NULL,
  eligibleCount INTEGER NOT NULL,closedBy TEXT NOT NULL,closedAt BIGINT NOT NULL,
  effectiveAt BIGINT NOT NULL)''')
 db.execute('''CREATE TABLE IF NOT EXISTS MarketMiziVipPoolShare(
  id TEXT PRIMARY KEY,period TEXT NOT NULL,beneficiaryId TEXT NOT NULL,
  f1Sales BIGINT NOT NULL,shareBps INTEGER NOT NULL,amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCRUED',created BIGINT NOT NULL,
  UNIQUE(period,beneficiaryId))''')
 db.execute('CREATE INDEX IF NOT EXISTS MarketMiziVipPoolShare_beneficiary ON MarketMiziVipPoolShare(beneficiaryId,period)')
 db.execute('''CREATE TABLE IF NOT EXISTS MarketMiziVipWithdrawalWindow(
  period TEXT PRIMARY KEY,opened INTEGER NOT NULL DEFAULT 0,
  updatedBy TEXT NOT NULL,updated BIGINT NOT NULL)''')
 db.execute('''CREATE TABLE IF NOT EXISTS MarketMiziVipWithdrawal(
  id TEXT PRIMARY KEY,shareId TEXT NOT NULL UNIQUE,beneficiaryId TEXT NOT NULL,
  bankName TEXT NOT NULL,bankAccount TEXT NOT NULL,accountName TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',created BIGINT NOT NULL,
  paidAt BIGINT,reference TEXT,confirmedBy TEXT)''')
 db.execute('CREATE INDEX IF NOT EXISTS MarketMiziVipWithdrawal_beneficiary ON MarketMiziVipWithdrawal(beneficiaryId,created)')
 db.execute('CREATE INDEX IF NOT EXISTS MarketSettlement_store_created ON MarketSettlement(storeId,created)')
 db.execute('CREATE INDEX IF NOT EXISTS MarketOrder_user_status_created ON MarketOrder(userId,status,created)')
 db.execute('CREATE INDEX IF NOT EXISTS User_referredById ON User(referredById)')
 db.execute("INSERT OR IGNORE INTO MarketSetting(key,value) VALUES('affiliate:mizi-vip:effective',?)",(str(int(time.time()*1000)),))
 db.commit()
 print('Mizi VIP schema ready')
except:
 db.rollback()
 raise
finally:
 db.close()
