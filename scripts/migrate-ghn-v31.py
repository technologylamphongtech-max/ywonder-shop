import sqlite3,sys
from pathlib import Path

p=Path(sys.argv[1]);assert p.is_file(),p
with sqlite3.connect(p,timeout=30) as db:
 db.execute('PRAGMA busy_timeout=30000')
 db.executescript('''
 CREATE TABLE IF NOT EXISTS MarketStoreGhnConfig(
   storeId TEXT PRIMARY KEY,
   shopId INTEGER NOT NULL,
   tokenCipher TEXT NOT NULL,
   environment TEXT NOT NULL CHECK(environment IN ('STAGING','PRODUCTION')),
   shopName TEXT NOT NULL,
   pickupAddress TEXT NOT NULL,
   enabled INTEGER NOT NULL DEFAULT 1,
   updated BIGINT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS MarketGhnShipment(
   orderId TEXT PRIMARY KEY,
   storeId TEXT NOT NULL,
   shopId INTEGER NOT NULL,
   environment TEXT NOT NULL CHECK(environment IN ('STAGING','PRODUCTION')),
   clientOrderCode TEXT NOT NULL UNIQUE,
   orderCode TEXT NOT NULL DEFAULT '',
   status TEXT NOT NULL CHECK(status IN ('CREATING','ERROR','CREATED')),
   ghnStatus TEXT NOT NULL DEFAULT '',
   weight INTEGER NOT NULL,
   length INTEGER NOT NULL,
   width INTEGER NOT NULL,
   height INTEGER NOT NULL,
   quotedFee INTEGER NOT NULL DEFAULT 0,
   actualFee INTEGER NOT NULL DEFAULT 0,
   codAmount INTEGER NOT NULL DEFAULT 0,
   expectedDelivery TEXT NOT NULL DEFAULT '',
   lastError TEXT NOT NULL DEFAULT '',
   created BIGINT NOT NULL,
   updated BIGINT NOT NULL
 );
 CREATE UNIQUE INDEX IF NOT EXISTS MarketGhnShipment_code ON MarketGhnShipment(environment,shopId,orderCode) WHERE orderCode<>'';
 ''')
 db.commit()
print('GHN seller and shipment schema ready')
