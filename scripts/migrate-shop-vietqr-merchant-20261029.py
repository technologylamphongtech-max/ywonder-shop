"""Add a unique receipt ledger before VietQR's retrying transaction callback can be activated."""
import sqlite3,sys
with sqlite3.connect(sys.argv[1],timeout=30) as db:
    assert db.execute("SELECT 1 FROM sqlite_master WHERE name='MarketOrderBankPayment'").fetchone()
    db.execute('''CREATE TABLE IF NOT EXISTS MarketVietQrReceipt(
      id TEXT PRIMARY KEY,
      transactionId TEXT NOT NULL UNIQUE,
      reference TEXT NOT NULL UNIQUE,
      orderId TEXT NOT NULL UNIQUE REFERENCES MarketOrder(id),
      amountVnd INTEGER NOT NULL CHECK(amountVnd>0),
      bankAccount TEXT NOT NULL,
      receivedAt BIGINT NOT NULL
    )''')
print('VietQR Merchant receipt ledger ready')
