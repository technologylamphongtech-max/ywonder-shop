"""Run only against the isolated server and test.db; never production."""
import json,sys,urllib.request,urllib.error,sqlite3,secrets,uuid,concurrent.futures,os
from pathlib import Path
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3064'
dbpath=Path(os.environ.get('YWONDER_TEST_DB','/var/www/ywonder-market/test.db'))
assert base=='http://127.0.0.1:3064'
conn=sqlite3.connect(dbpath,timeout=30)
class Client:
 def __init__(self):self.cookie=''
 def request(self,action=None,data=None,status=200,origin='http://127.0.0.1:4175',suffix=''):
  headers={'Origin':origin,'Content-Type':'application/json','Cookie':self.cookie}
  payload=json.dumps(dict(action=action,**(data or {}))).encode() if action else None
  req=urllib.request.Request(base+'/api/market'+suffix,data=payload,headers=headers)
  try:r=urllib.request.urlopen(req,timeout=30)
  except urllib.error.HTTPError as e:r=e
  result=json.loads(r.read());assert r.status==status,(action,r.status,result)
  if r.headers.get('Set-Cookie'):self.cookie=r.headers['Set-Cookie'].split(';')[0]
  return result
 def register(self,name):
  self.email='market-test-'+uuid.uuid4().hex+'@example.invalid';self.password=secrets.token_urlsafe(20)
  self.request('register',{'fullName':name,'login':self.email,'password':self.password})
  self.uid=self.request()['account']['user']['id']
anon=Client()
assert len(anon.request()['categories'])==12
anon.request('settings',{},status=401)
anon.request('register',{},status=403,origin='https://untrusted.invalid')
forged=Client();forged.cookie='yw_market_session=made-up; shop_user_id=admin'
assert forged.request()['account'] is None
print('PASS public catalog, CSRF, anonymous admin access, forged cookie')
admin=Client();admin.register('Integration admin')
conn.execute("UPDATE User SET role='ADMIN' WHERE id=?",(admin.uid,));conn.commit()
seller=Client();seller.register('Integration seller')
buyer=Client();buyer.register('Integration buyer')
buyer.request(None,status=403,suffix='?action=admin')
buyer.request('product',{'name':'unauthorized'},status=400)
seller.request('store',{'name':'Test store','phone':'0900000000','address':'Test warehouse','description':'Isolated test'})
store=seller.request()['account']['store'];assert store['status']=='PENDING'
admin.request('storeReview',{'id':store['id'],'status':'APPROVED','feeBps':1000})
cfg={'feeBps':500,'rewardBps':100,'pointValue':1,'shipping':20000,'aiModel':''}
admin.request('settings',cfg)
seller.request('product',{'name':'Test coffee','categoryId':'sieu-thi-tap-hoa','price':100000,'stock':10,'image':'/assets/coffee.jpg','description':'Isolated product','active':True})
sp=seller.request()['account']['storeProducts'][0];assert sp['active']==0
assert all(p['id']!=sp['id'] for p in anon.request()['products'])
admin.request('product',dict(sp,active=True))
pid=sp['id']
buyer.request('product',dict(sp,price=1,active=True),status=400)
buyer.request('favorite',{'productId':pid,'liked':True})
buyer.request('preferences',{'interests':['sieu-thi-tap-hoa','invalid'],'notifications':True})
account=buyer.request()['account'];assert pid in account['favorites'];assert json.loads(account['profile']['interests'])==['sieu-thi-tap-hoa']
print('PASS registration, seller approval, product ownership, moderation, favorites, preferences')
admin.request('content',{'type':'promotion','title':'Test coupon','body':'test','code':'T'+uuid.uuid4().hex[:8],'discountBps':1000,'active':True})
coupon=admin.request(suffix='?action=admin')['content'][0]
conn.execute('UPDATE MarketProfile SET points=500 WHERE userId=?',(buyer.uid,));conn.commit()
checkout={'requestId':str(uuid.uuid4()),'name':'Buyer','phone':'0900000001','address':'Test address','items':[{'productId':pid,'quantity':1},{'productId':pid,'quantity':1}],'code':coupon['code'],'points':500,'total':1}
order=buyer.request('checkout',checkout)['orderId']
assert buyer.request('checkout',checkout)['orderId']==order
account=buyer.request()['account'];o=next(o for o in account['orders'] if o['id']==order)
assert o['total']==199500 and o['rewardPoints']==1795,o
assert next(p for p in anon.request()['products'] if p['id']==pid)['stock']==8
assert account['profile']['points']==0
seller.request('cancelOrder',{'id':order},status=400)
buyer.request('orderStatus',{'id':order,'status':'COMPLETED'},status=403)
admin.request('orderStatus',{'id':order,'status':'COMPLETED'},status=400)
admin.request('settings',dict(cfg,feeBps=3000,rewardBps=500))
for state in ['CONFIRMED','SHIPPED','COMPLETED']:admin.request('orderStatus',{'id':order,'status':state})
admin.request('orderStatus',{'id':order,'status':'COMPLETED'},status=400)
account=buyer.request()['account'];assert account['profile']['points']==1845
settlement=next(s for s in seller.request()['account']['settlements'] if s['orderId']==order)
assert settlement['gross']==179500 and settlement['fee']==17950 and settlement['net']==161550,settlement
print('PASS server price, discount, point use, merged items, idempotency, fee snapshot, reward, settlement')
checkout2=dict(checkout,requestId=str(uuid.uuid4()),code='',points=1000,items=[{'productId':pid,'quantity':1}])
order2=buyer.request('checkout',checkout2)['orderId']
buyer.request('cancelOrder',{'id':order2});buyer.request('cancelOrder',{'id':order2},status=400)
assert buyer.request()['account']['profile']['points']==1845
assert next(p for p in anon.request()['products'] if p['id']==pid)['stock']==8
buyer.request('checkout',dict(checkout2,requestId=str(uuid.uuid4()),items=[{'productId':pid,'quantity':99}]),status=400)
buyer.request('checkout',dict(checkout2,requestId=str(uuid.uuid4()),points=999999),status=400)
admin.request('storeReview',{'id':store['id'],'status':'SUSPENDED','feeBps':1000})
assert all(p['id']!=pid for p in anon.request()['products'])
buyer.request('checkout',dict(checkout2,requestId=str(uuid.uuid4())),status=400)
admin.request('storeReview',{'id':store['id'],'status':'APPROVED','feeBps':1000})
admin.request('settlementPaid',{'id':settlement['id']});admin.request('settlementPaid',{'id':settlement['id']},status=400)
print('PASS cancel/restock/refund once, insufficient stock/points, suspended shop, settlement idempotency')
buyer.request('readNotifications');assert all(n['seen'] for n in buyer.request()['account']['notifications'])
old=Client();old.cookie=buyer.cookie
buyer.request('password',{'currentPassword':buyer.password,'password':secrets.token_urlsafe(20)})
assert old.request()['account'] is None
assert anon.request('searchAI',{'prompt':'test'})['mode']=='standard'
admin.request('settings',dict(cfg,aiEnabled=True),status=400)
print('PASS notifications, password/session revocation, AI fallback and missing-key guard')
# Additional edge cases
buyer.request('profile',{'fullName':'Updated buyer','phone':'0900012345','address':'Updated address'})
assert buyer.request()['account']['profile']['address']=='Updated address'
for kind in ['banner','news']:
 admin.request('content',{'type':kind,'title':'QA '+kind,'body':'QA body','image':'/assets/hero.png','active':True})
 assert any(c['type']==kind for c in anon.request()['content'])
admin.request('content',{'type':'news','title':'Unsafe link','link':'javascript:alert(1)','active':True},status=400)
admin.request('content',{'type':'promotion','title':'Expired','code':'EXPIRED'+uuid.uuid4().hex[:8],'discountBps':1000,'active':True,'starts':1,'ends':2})
assert not any(c['title']=='Expired' for c in anon.request()['content'])
admin.request('category',{'id':'sieu-thi-tap-hoa','name':'Siêu Thị Tạp Hóa','sort':5,'active':False,'featured':True})
assert all(p['id']!=pid for p in anon.request()['products'])
admin.request('category',{'id':'sieu-thi-tap-hoa','name':'Siêu Thị Tạp Hóa','sort':5,'active':True,'featured':True})
admin.request('settings',dict(cfg,feeBps=10001),status=400)
admin.request('product',dict(sp,active=True,price=-1),status=400)
second=Client();second.request('login',{'login':seller.email,'password':seller.password})
assert second.request()['account']['user']['id']==seller.uid
seller.request('revokeSessions');assert second.request()['account'] is None
second.request('login',{'login':seller.email,'password':'wrong'},status=400)
conn.execute("UPDATE User SET status='BLOCKED' WHERE id=?",(seller.uid,));conn.commit()
assert seller.request()['account'] is None
conn.execute("UPDATE User SET status='ACTIVE' WHERE id=?",(seller.uid,));conn.commit()
conn.execute('UPDATE MarketProduct SET stock=1 WHERE id=?',(pid,));conn.commit()
def attempt(_):
 c=Client();c.cookie=buyer.cookie
 payload=dict(checkout2,requestId=str(uuid.uuid4()),points=0)
 try: return c.request('checkout',payload)['orderId']
 except AssertionError: return None
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(attempt,[1,2]))
assert sum(bool(r) for r in results)==1,results
assert conn.execute('SELECT stock FROM MarketProduct WHERE id=?',(pid,)).fetchone()[0]==0
print('PASS profile, banner/news, unsafe link, schedules, hidden category, numeric validation, login, session revoke, blocked account, concurrent stock')
print('ALL INTEGRATION CHECKS PASSED')
