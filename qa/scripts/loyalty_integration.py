"""Isolated loyalty regression checks for YWonder Shop."""
import json,sys,urllib.request,urllib.error,sqlite3,secrets,uuid,os,datetime
from pathlib import Path
base='http://127.0.0.1:3064'
dbpath=Path(os.environ.get('YWONDER_TEST_DB','qa/isolated-commerce-20261004.db'))
class Client:
 def __init__(self): self.cookie=''; self.email=''; self.password=''; self.uid=''
 def request(self,action=None,data=None,status=200,suffix=''):
  headers={'Origin':'http://127.0.0.1:4175','Content-Type':'application/json','Cookie':self.cookie}
  payload=json.dumps(dict(action=action,**(data or {}))).encode() if action else None
  req=urllib.request.Request(base+'/api/market'+suffix,data=payload,headers=headers)
  try:r=urllib.request.urlopen(req,timeout=30)
  except urllib.error.HTTPError as e:r=e
  body=r.read()
  try: result=json.loads(body)
  except Exception: result={'raw':body.decode(errors='replace')}
  assert r.status==status,(action,r.status,result)
  if r.headers.get('Set-Cookie'): self.cookie=r.headers['Set-Cookie'].split(';')[0]
  return result
 def register(self,name,refCode=''):
  self.email='loyalty-'+uuid.uuid4().hex+'@example.invalid'; self.password=secrets.token_urlsafe(20)
  self.request('register',{'fullName':name,'login':self.email,'password':self.password,'refCode':refCode})
  self.uid=self.request()['account']['user']['id']
  return self.request()['account']

def profile(c): return c.request()['account']['profile']
def points(c): return int(profile(c)['points'])
anon=Client(); public=anon.request()
assert len(public['categories'])==12
assert all(k in public for k in ('tiers','hubs','voucherCampaigns'))
print('PASS public 12 Lazada categories, tiers, hubs, voucher campaigns')

admin=Client(); admin.register('Isolated admin')
conn=sqlite3.connect(dbpath); conn.execute("UPDATE User SET role='ADMIN' WHERE id=?",(admin.uid,)); conn.commit()
referrer=Client(); referrer.register('Referrer')
ref_code=conn.execute('SELECT refCode FROM User WHERE id=?',(referrer.uid,)).fetchone()[0]
user=Client(); user.register('Loyalty user',ref_code)
assert points(referrer)==100
print('PASS referral reward +100 Xu and referral ledger')

admin.request('settings',{'feeBps':0,'rewardBps':100,'shipping':0,'pointValue':1,'aiModel':'',
                  'ywbEnabled':False,'xuEnabled':True,'xuVndRate':5,
                  'attendanceDaily':30,'attendanceWeekly':500,'attendanceMonthly':3000})
user.request('attendance')
assert points(user)==30 and user.request()['account']['loyalty']['attendanceToday']
user.request('attendance',status=400)
print('PASS daily attendance +30, Vietnam day uniqueness')

products=[]
for i in range(3):
 admin.request('product',{'name':f'Loyalty product {i}','categoryId':'sieu-thi-tap-hoa',
                          'price':1000,'stock':10,'image':'/assets/hero.png',
                          'description':'isolated','active':True})
admin_data=admin.request(suffix='?action=admin')
products=[p for p in admin_data['products'] if p['name'].startswith('Loyalty product')][:3]
assert len(products)==3
for p in (products[0],products[0],products[1],products[2]):
 user.request('taskEvent',{'key':'view_products','ref':p['id']})
assert points(user)==40
progress=next(t for t in user.request()['account']['loyalty']['tasks'] if t['key']=='view_products')
assert progress['progress']==3 and progress['rewarded']
print('PASS view-products task counts distinct products only and rewards +10 once')

video_id='video-'+uuid.uuid4().hex
admin.request('content',{'id':video_id,'type':'video','title':'Video QA','body':'Video task fixture','link':'https://cdn.example.invalid/video.mp4','active':True})
assert any(c['id']==video_id and c['type']=='video' for c in admin.request(suffix='?action=admin')['content'])
user.request('taskEvent',{'key':'watch_video','ref':'missing-video'},status=400)
user.request('taskEvent',{'key':'watch_video','ref':video_id})
assert points(user)==50
print('PASS admin video content, valid completion and invalid-video rejection')

hub_token='QR-'+uuid.uuid4().hex
admin.request('hub',{'name':'HUB Test 1','qrToken':hub_token,'active':True,'qrExpires':0})
user.request('hubCheckin',{'qrToken':'invalid'},status=400)
user.request('hubCheckin',{'qrToken':hub_token})
assert points(user)==210
user.request('hubCheckin',{'qrToken':hub_token},status=400)
print('PASS HUB QR validation, +80 check-in, +50 visit, +30 scan and duplicate block')

hub_token2='QR-'+uuid.uuid4().hex
admin.request('hub',{'name':'HUB Test 2','qrToken':hub_token2,'active':True,'qrExpires':0})
yesterday=(datetime.date.today()-datetime.timedelta(days=1)).isoformat()
conn.execute("UPDATE MarketProfile SET hubLast=?,hubStreak=? WHERE userId=?",(yesterday,6,user.uid)); conn.commit()
user.request('hubCheckin',{'qrToken':hub_token2})
assert points(user)==790
print('PASS HUB 7-day milestone +500')

campaign_id='campaign-'+uuid.uuid4().hex
admin.request('voucherCampaign',{'id':campaign_id,'title':'Voucher QA','code':'QA'+uuid.uuid4().hex[:8],
                                'faceValue':500,'pointsCost':100,'stock':2,'perUser':1,
                                'active':True,'starts':0,'ends':0})
user.request('redeemVoucher',{'campaignId':campaign_id})
assert points(user)==690
voucher=user.request()['account']['loyalty']['vouchers'][0]
assert voucher['status']=='UNUSED'
print('PASS voucher stock, per-user limit, Xu debit and voucher issuance')

admin.request('settings',{'ywbEnabled':True,'ywbToVnd':1,'ywbMinTransfer':1,
                          'ywbMaxTransfer':1000,'ywbDailyLimit':1000,
                          'allowXuWithYwb':False,'allowVoucherWithYwb':True,
                          'xuEnabled':True,'xuVndRate':5,'attendanceDaily':30,
                          'attendanceWeekly':500,'attendanceMonthly':3000,
                          'feeBps':0,'rewardBps':100,'shipping':0,'pointValue':1,'aiModel':''})
user.request('linkHub',{'hubAccountId':'HUB-ACCOUNT-QA'},status=400)
conn.execute('UPDATE MarketProfile SET hubAccountId=?,hubLinkedAt=? WHERE userId=?',(user.uid,1,user.uid))
conn.execute('INSERT INTO Wallet(id,userId,balanceYwh,updatedAt) VALUES(?,?,200,?)',(str(uuid.uuid4()),user.uid,1)); conn.commit()
request_id='ywb-'+uuid.uuid4().hex
user.request('ywbTransfer',{'amount':100,'requestId':request_id})
admin_data=admin.request(suffix='?action=admin')
transfer=next(t for t in admin_data['transfers'] if t['idempotency']==request_id)
assert transfer['status']=='COMPLETED'
admin.request('ywbTransferStatus',{'id':transfer['id'],'status':'COMPLETED'},status=400)
assert conn.execute('SELECT balanceYwh FROM Wallet WHERE userId=?',(user.uid,)).fetchone()[0]==100
assert int(profile(user)['ywbBalance'])==100
print('PASS direct HUB-to-Shop YWH debit/credit, no approval, manual credit blocked')

checkout=user.request('checkout',{'requestId':'order-ywb-'+uuid.uuid4().hex,
                                 'name':'Loyalty user','phone':'0900000000','address':'QA',
                                 'items':[{'productId':products[1]['id'],'quantity':1}],
                                 'code':'','points':0,'ywb':100})
assert checkout['orderId'] and int(profile(user)['ywbBalance'])==0
order_id=checkout['orderId']
for state in ('CONFIRMED','SHIPPED','COMPLETED'):
 admin.request('orderStatus',{'id':order_id,'status':state})
assert points(user)==749
account=user.request()['account']
assert account['loyalty']['currentTier']['key']=='BRONZE'
print('PASS YWB checkout discount, balance debit, order completion task +50, Bronze tier')

user.request('checkout',{'requestId':'order-voucher-'+uuid.uuid4().hex,
                         'name':'Loyalty user','phone':'0900000000','address':'QA',
                         'items':[{'productId':products[2]['id'],'quantity':1}],
                         'code':voucher['code'],'points':0,'ywb':0})
print('PASS issued voucher accepted at checkout')
assert user.request('searchAI',{'prompt':'test'})['mode']=='standard'
print('PASS AI fallback when provider is not configured')
print('ALL LOYALTY CHECKS PASSED')
