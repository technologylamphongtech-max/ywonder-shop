import sqlite3,sys
from pathlib import Path
p=Path(sys.argv[1]);assert p.is_file(),p
with sqlite3.connect(p,timeout=30) as db:
 db.execute('PRAGMA busy_timeout=30000')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS MarketAffiliateBankAccount(userId TEXT PRIMARY KEY,bankName TEXT NOT NULL,bankAccount TEXT NOT NULL,accountName TEXT NOT NULL,updated BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS MarketStoreOrderApproval(orderId TEXT NOT NULL,storeId TEXT NOT NULL,approvedBy TEXT NOT NULL,approvedAt BIGINT NOT NULL,PRIMARY KEY(orderId,storeId));
 CREATE TABLE IF NOT EXISTS MarketStoreBankAccount(storeId TEXT PRIMARY KEY,bankName TEXT NOT NULL,bankCode TEXT NOT NULL DEFAULT '',bankAccount TEXT NOT NULL,accountName TEXT NOT NULL,qrImage TEXT NOT NULL DEFAULT '',updated BIGINT NOT NULL);
 ''')
 cols={row[1] for row in db.execute('PRAGMA table_info(MarketOrderBankPayment)')}
 if 'qrImage' not in cols:db.execute("ALTER TABLE MarketOrderBankPayment ADD COLUMN qrImage TEXT NOT NULL DEFAULT ''")
 if 'storeId' not in cols:db.execute("ALTER TABLE MarketOrderBankPayment ADD COLUMN storeId TEXT NOT NULL DEFAULT ''")
 db.commit()
print('Store bank and affiliate bank schema ready')
