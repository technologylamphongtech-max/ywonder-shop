import sqlite3
import subprocess
import sys
from pathlib import Path

path=Path(sys.argv[1]).resolve()
if path.exists(): raise RuntimeError('Use a new fixture path')
db=sqlite3.connect(path)
db.executescript('''
CREATE TABLE User(id TEXT PRIMARY KEY,username TEXT,fullName TEXT,email TEXT,refCode TEXT,referredById TEXT,status TEXT,role TEXT);
CREATE TABLE MarketStore(id TEXT PRIMARY KEY,userId TEXT,name TEXT,status TEXT,affiliateReferrerId TEXT);
CREATE TABLE MarketOrder(id TEXT PRIMARY KEY,userId TEXT,total INTEGER,shipping INTEGER,status TEXT,created BIGINT);
CREATE TABLE MarketOrderItem(id TEXT PRIMARY KEY,orderId TEXT,storeId TEXT,net INTEGER);
CREATE TABLE MarketSettlement(id TEXT PRIMARY KEY,storeId TEXT,orderId TEXT,itemId TEXT,gross INTEGER,fee INTEGER,net INTEGER,status TEXT,created INTEGER);
CREATE TABLE MarketSetting(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE MarketAudit(id TEXT,userId TEXT,action TEXT,target TEXT,created INTEGER);
CREATE TABLE MarketNotification(id TEXT,userId TEXT,title TEXT,body TEXT,seen INTEGER,created INTEGER);
''')
users=[('owner','owner','Owner','owner@example.test','owner',None,'ACTIVE','MERCHANT'),('a','alpha','Alpha','alpha@example.test','alpha',None,'ACTIVE','MEMBER'),('b','beta','Beta','beta@example.test','beta',None,'ACTIVE','MEMBER'),('buyer','buyer','Buyer','buyer@example.test','buyer',None,'ACTIVE','MEMBER'),('admin','admin','Admin','admin@example.test','admin',None,'ACTIVE','ADMIN')]
db.executemany('INSERT INTO User VALUES(?,?,?,?,?,?,?,?)',users)
store='70297741-e78b-4ef9-b659-80fc513330a8'
db.execute('INSERT INTO MarketStore VALUES(?,?,?,?,?)',(store,'owner','Phong Châu','APPROVED',None))
db.execute('INSERT INTO MarketStore VALUES(?,?,?,?,?)',('other-store','owner','Gian hàng khác','APPROVED','a'))
db.executemany('INSERT INTO MarketOrder VALUES(?,?,?,?,?,?)',[(f'order-{i}','buyer',2500000,0,'PENDING',1757898000000+i) for i in range(1,4)])
db.executemany('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',[(f'item-{i}',f'order-{i}',store,2500000) for i in range(1,4)])
db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?,?)',('order-other','buyer',2500000,0,'COMPLETED',1757898000004))
db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('item-other','order-other','other-store',2500000))
db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?,?)',('order-mixed','buyer',5000000,0,'COMPLETED',1757898000005))
db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('item-mixed-pc','order-mixed',store,2500000))
db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('item-mixed-other','order-mixed','other-store',2500000))
for number in range(11):
 user=f'f{number}'
 db.execute('INSERT INTO User VALUES(?,?,?,?,?,?,?,?)',(user,user,user,user+'@example.test',user,None,'ACTIVE','MEMBER'))
 db.execute('INSERT INTO MarketOrder VALUES(?,?,?,?,?,?)',('pool-'+user,user,2500000,0,'COMPLETED',1757898000000+number))
 db.execute('INSERT INTO MarketOrderItem VALUES(?,?,?,?)',('pool-item-'+user,'pool-'+user,store,2500000))
 db.execute('INSERT INTO MarketSettlement VALUES(?,?,?,?,?,?,?,?,?)',('pool-settle-'+user,store,'pool-'+user,'pool-item-'+user,2500000,0,2500000,'PENDING',1757898000000+number*1000))
db.execute("INSERT INTO MarketSetting VALUES('affiliate:phongchau:effective','1')")
db.execute("INSERT INTO MarketSetting VALUES('affiliate:phongchau:exclusive:effective','1')")
db.commit();db.close()
scripts=path.parents[1]/'scripts'
for name in ('migrate-affiliate.py','migrate-store-f1.py','migrate-store-affiliate-selection.py','migrate-affiliate-phongchau.py','migrate-affiliate-phongchau-groups.py'):
 subprocess.run([sys.executable,str(scripts/name),str(path)],check=True)
db=sqlite3.connect(path)
db.execute("UPDATE MarketSetting SET value='1' WHERE key='affiliate:phongchau:effective'")
db.executemany('INSERT INTO MarketStoreF1 VALUES(?,?,?)',[(store,f'f{number}',1756684800000) for number in range(10)])
db.commit();db.close()
print('Store affiliate selection fixture ready')
