"""Only run against the isolated 127.0.0.1:3064 preview database."""
import hashlib,json,sqlite3,sys,time,urllib.error,urllib.request,uuid
from pathlib import Path

dbpath=Path(sys.argv[1]).resolve()
assert '/releases/20261028-shop-bank-localqr-v1/qa/preview.db' in dbpath.as_posix()
db=sqlite3.connect(dbpath,timeout=30)
users=db.execute("SELECT id FROM User WHERE status='ACTIVE' LIMIT 2").fetchall()
assert len(users)==2
buyer,admin=users[0][0],users[1][0]
db.execute("UPDATE User SET role='ADMIN' WHERE id=?",(admin,))
cookies={}
for uid in (buyer,admin):
 token=uuid.uuid4().hex
 db.execute('INSERT INTO MarketSession(token,userId,expires,created) VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),uid,int(time.time()*1000)+3600000,int(time.time()*1000)))
 cookies[uid]='yw_market_session='+token
db.commit()

def request(uid=None,body=None):
 headers={'Origin':'https://shop.ywonder.net','Content-Type':'application/json'}
 if uid:headers['Cookie']=cookies[uid]
 req=urllib.request.Request('http://127.0.0.1:3064/api/market',data=json.dumps(body).encode() if body else None,headers=headers)
 try:r=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as error:r=error
 return r.status,json.load(r)

status,public=request();assert status==200,(status,public)
with urllib.request.urlopen('http://127.0.0.1:3064/assets/shop-techcombank-61867899-qr.png',timeout=10) as response:
 assert response.status==200 and response.headers.get('Content-Type','').startswith('image/png')
assert public['policySite']['bank']['accountNumber']=='61867899'
assert public['policySite']['bank']['bankCode']=='970407'
assert public['policySite']['bank']['accountName']=='CONG TY CP DAU TU-THUONG MAI-DICH VU YWONDER PHONG CHAU'
product=next(p for p in public['products'] if p['stock']>=2 and p['price']>1000)
base={'action':'checkout','name':'QA buyer','phone':'0900000001','address':'QA preview address',
      'items':[{'productId':product['id'],'quantity':1}],
      'buyerTermsVersion':public['policySite']['versions']['buyer'],'acceptBuyerTerms':True}
status,created=request(buyer,{**base,'requestId':str(uuid.uuid4()),'paymentMethod':'BANK'});assert status==200,(status,created)
order_id=created['orderId']
status,account=request(buyer);assert status==200
order=next(row for row in account['account']['orders'] if row['id']==order_id)
assert order['paymentStatus']=='AWAITING' and order['paymentAmount']==order['total']
assert order['paymentAccountNumber']=='61867899' and order['paymentBankCode']=='970407'
assert order['paymentMemo']=='YWS'+order_id.replace('-','').upper()
reference='QA-TRANSFER-'+uuid.uuid4().hex
assert request(buyer,{'action':'confirmBankPayment','id':order_id,'reference':reference,'confirmed':True})[0]==403
assert request(admin,{'action':'orderStatus','id':order_id,'status':'CONFIRMED'})[0]==400
assert request(admin,{'action':'confirmBankPayment','id':order_id,'reference':reference,'confirmed':False})[0]==400
verified={'action':'confirmBankPayment','id':order_id,'reference':reference,'confirmed':True}
assert request(admin,verified)[0]==200
assert request(admin,verified)[1]['alreadyVerified'] is True
assert request(admin,{'action':'orderStatus','id':order_id,'status':'CONFIRMED'})[0]==200
assert request(buyer,{'action':'cancelOrder','id':order_id})[0]==400
assert request(admin,{'action':'orderStatus','id':order_id,'status':'CANCELLED'})[0]==400
status,created=request(buyer,{**base,'requestId':str(uuid.uuid4()),'paymentMethod':'COD'});assert status==200,(status,created)
cod=created['orderId']
assert request(admin,{'action':'orderStatus','id':cod,'status':'CONFIRMED'})[0]==200
assert db.execute('SELECT COUNT(*) FROM MarketOrderBankPayment WHERE orderId=?',(cod,)).fetchone()[0]==0
print('PASS isolated Shop: VietQR bank snapshot, amount and memo, admin bank verification gate, replay, verified cancel block, COD unchanged')
