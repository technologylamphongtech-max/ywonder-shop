import sqlite3,sys,subprocess
from pathlib import Path
file=Path(sys.argv[1]).resolve()
if file.exists(): raise RuntimeError('Use a fresh fixture path')
db=sqlite3.connect(file)
db.executescript('''CREATE TABLE User(id TEXT PRIMARY KEY,referredById TEXT,status TEXT,role TEXT,fullName TEXT);
CREATE TABLE MarketStore(id TEXT PRIMARY KEY,userId TEXT);
CREATE TABLE MarketOrder(id TEXT PRIMARY KEY,userId TEXT,total INTEGER,shipping INTEGER);
CREATE TABLE MarketOrderItem(id TEXT PRIMARY KEY,orderId TEXT,storeId TEXT,net INTEGER);''')
db.execute('CREATE TABLE MarketSetting(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
db.execute("INSERT INTO MarketSetting VALUES('affiliate:phongchau:effective','9999999999999')")
db.executemany('INSERT INTO User VALUES(?,?,?,?,?)',[(f'u{i}',f'u{i+1}' if i<11 else None,'ACTIVE','MEMBER',f'Test {i}') for i in range(12)])
db.execute("INSERT INTO User VALUES('vendor','u10','ACTIVE','MEMBER','Test vendor')")
db.execute("INSERT INTO MarketStore VALUES('s1','vendor')")
db.execute("INSERT INTO MarketOrder VALUES('o1','u0',1020000,20000)")
db.executemany('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',[('i1','o1','s1',600000),('i2','o1',None,400000)])
db.commit();db.close()
subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'scripts/migrate-affiliate.py'),str(file)],check=True)
print('Fixture ready:',file)
