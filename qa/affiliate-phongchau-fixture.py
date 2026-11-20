import sqlite3,sys,subprocess
from pathlib import Path

path=Path(sys.argv[1]).resolve()
if path.exists():raise RuntimeError('Choose a new fixture path')
db=sqlite3.connect(path)
db.executescript('''
CREATE TABLE User(id TEXT PRIMARY KEY,refCode TEXT,referredById TEXT,status TEXT,role TEXT,fullName TEXT,email TEXT);
CREATE TABLE MarketStore(id TEXT PRIMARY KEY,userId TEXT,name TEXT);
CREATE TABLE MarketOrder(id TEXT PRIMARY KEY,userId TEXT,total INTEGER,shipping INTEGER,status TEXT);
CREATE TABLE MarketOrderItem(id TEXT PRIMARY KEY,orderId TEXT,storeId TEXT,net INTEGER);
CREATE TABLE MarketSettlement(id TEXT PRIMARY KEY,storeId TEXT,orderId TEXT,itemId TEXT,gross INTEGER,fee INTEGER,net INTEGER,status TEXT,created INTEGER);
CREATE TABLE MarketSetting(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE MarketAudit(id TEXT,userId TEXT,action TEXT,target TEXT,created INTEGER);
''')
store='70297741-e78b-4ef9-b659-80fc513330a8'
db.executemany('INSERT INTO User VALUES(?,?,?,?,?,?,?)',[
 ('a','a',None,'ACTIVE','MEMBER','Alice','a@example.invalid'),
 ('b','b',None,'ACTIVE','MEMBER','Binh','b@example.invalid'),
 ('c','c',None,'ACTIVE','MEMBER','Chi','c@example.invalid'),
 ('vendor','vendor',None,'ACTIVE','MERCHANT','Phong Chau','vendor@example.invalid'),
 ('buyer','buyer',None,'ACTIVE','MEMBER','Link buyer','buyer@example.invalid'),
])
db.execute('INSERT INTO MarketStore VALUES(?,?,?)',(store,'vendor','YWONDER PHONG CHÂU'))
stamp=1757898000000 # 2025-09-15 Asia/Ho_Chi_Minh; period is closed in 2026
for prefix,count in [('a',25),('b',10),('c',9)]:
 for i in range(count):
  buyer=f'{prefix}{i}'
  db.execute('INSERT INTO User VALUES(?,?,?,?,?,?,?)',(buyer,buyer,prefix,'ACTIVE','MEMBER',buyer,buyer+'@example.invalid'))
  order=f'order-{buyer}'
  db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?)',(order,buyer,2500000,0,'COMPLETED'))
  db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',(f'item-{buyer}',order,store,2500000))
  db.execute('INSERT INTO MarketSettlement VALUES(?,?,?,?,?,?,?,?,?)',(f'settle-{buyer}',store,order,f'item-{buyer}',2500000,0,2500000,'PENDING',stamp+i*1000))
db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?)',('a0-extra','a0',1000000,0,'COMPLETED'))
db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('a0-extra-item','a0-extra',store,1000000))
db.execute('INSERT INTO MarketSettlement VALUES(?,?,?,?,?,?,?,?,?)',('a0-extra-settle',store,'a0-extra','a0-extra-item',1000000,0,1000000,'PENDING',stamp+50000))
db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?)',('link-order','buyer',2500000,0,'COMPLETED'))
db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('link-item','link-order',store,2500000))
db.execute('INSERT INTO MarketSettlement VALUES(?,?,?,?,?,?,?,?,?)',('link-settle',store,'link-order','link-item',2500000,0,2500000,'PENDING',stamp))
db.commit();db.close()
scripts=path.parents[1]/'scripts'
for name in ['migrate-affiliate.py','migrate-affiliate-admin.py','migrate-affiliate-phongchau.py','migrate-affiliate-phongchau-groups.py','migrate-affiliate-phongchau-wallet.py']:
 subprocess.run([sys.executable,str(scripts/name),str(path)],check=True)
db=sqlite3.connect(path)
db.execute("UPDATE MarketSetting SET value='1000' WHERE key='affiliate:phongchau:effective'")
db.commit();db.close()
print('Phong Chau fixture ready')
