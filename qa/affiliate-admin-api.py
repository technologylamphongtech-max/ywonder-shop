import sys,sqlite3,json,time,uuid,hashlib,urllib.request,urllib.error
dbfile=sys.argv[1]
if 'affiliate-admin-stage-' not in dbfile: raise RuntimeError('Only staging database allowed')
db=sqlite3.connect(dbfile,timeout=30)
baseline=db.execute('SELECT COALESCE(SUM(amount),0) FROM MarketAffiliateCommission').fetchone()[0]
stamp=int(time.time()*1000);prefix='affiliateqa-'+uuid.uuid4().hex
users=[prefix+f'-u{i}' for i in range(11)]
admin=prefix+'-admin';vendor=prefix+'-vendor'
def add_user(uid,role='MEMBER',ref=None):
    db.execute('INSERT INTO User(id,email,fullName,refCode,role,status,referredById,updatedAt,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',(uid,uid+'@example.invalid','Affiliate QA',uid,role,'ACTIVE',ref,stamp,stamp))
for i,uid in enumerate(users): add_user(uid,ref=users[i+1] if i<10 else None)
add_user(admin,role='ADMIN');add_user(vendor,ref=users[10])
store=prefix+'-store'
db.execute("INSERT INTO MarketStore(id,userId,name,phone,address,status,created,affiliateReferrerId) VALUES(?,?,?,?,?,'APPROVED',?,?)",(store,vendor,'Affiliate QA Store','0999999999','QA staging',stamp,users[10]))
category=db.execute('SELECT id FROM MarketCategory WHERE active=1 LIMIT 1').fetchone()[0]
products=[prefix+'-p1',prefix+'-p2']
for pid,price,storeid in zip(products,[600000,400000],[store,None]): db.execute('INSERT INTO MarketProduct(id,storeId,categoryId,name,sku,price,stock,active,created) VALUES(?,?,?,?,?,?,10,1,?)',(pid,storeid,category,'Affiliate QA',pid,price,stamp))
voucher=prefix+'-voucher'
db.execute('INSERT INTO MarketVoucher(id,campaignId,userId,code,faceValue,created) VALUES(?,?,?,?,100000,?)',(voucher,prefix,users[0],prefix.upper(),stamp))
settings=json.loads(db.execute("SELECT value FROM MarketSetting WHERE key='commerce'").fetchone()[0]);settings.update(shipping=20000,rewardBps=0)
db.execute("UPDATE MarketSetting SET value=? WHERE key='commerce'",(json.dumps(settings),))
tokens={}
for uid in users+[admin]:
    token=uuid.uuid4().hex;tokens[uid]=token
    db.execute('INSERT INTO MarketSession VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),uid,stamp+3600000,stamp))
db.commit()
def request(uid,body=None,admin_get=False):
    url='http://127.0.0.1:3064/api/market'+('?action=admin' if admin_get else '')
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json','Origin':'https://shop.ywonder.net','Cookie':'yw_market_session='+tokens[uid]})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,json.load(error)
def post(uid,body):
    code,data=request(uid,body)
    assert code==200,(code,data)
    return data
payload={'action':'checkout','requestId':prefix,'items':[{'productId':pid,'quantity':1} for pid in products],'name':'Affiliate QA','phone':'0999999999','address':'QA staging address','code':prefix.upper()}
order=post(users[0],payload)['orderId'];assert post(users[0],payload)['orderId']==order
assert db.execute('SELECT total FROM MarketOrder WHERE id=?',(order,)).fetchone()[0]==920000
assert db.execute('SELECT MIN(net),SUM(net) FROM MarketOrderItem WHERE orderId=?',(order,)).fetchone()==(360000,900000)
assert db.execute('SELECT COUNT(*) FROM MarketAffiliateCommission WHERE orderId=?',(order,)).fetchone()[0]==0
for state in ['CONFIRMED','SHIPPED','COMPLETED']:post(admin,{'action':'orderStatus','id':order,'status':state})
before=db.execute('SELECT COUNT(*),SUM(amount) FROM MarketAffiliateCommission WHERE orderId=?',(order,)).fetchone();assert before==(10,50400),before
code,_=request(admin,{'action':'orderStatus','id':order,'status':'COMPLETED'});assert code==400
assert db.execute('SELECT COUNT(*),SUM(amount) FROM MarketAffiliateCommission WHERE orderId=?',(order,)).fetchone()==before
for uid,expected in [(users[1],9000),(users[9],4500),(users[10],5400),(users[0],0)]:
    code,account=request(uid);assert code==200
    assert account['account']['affiliate']['totals']['earned']==expected
code,admin_data=request(admin,admin_get=True);assert code==200;assert admin_data['affiliate']['totals']['earned']==baseline+50400
# Canceled orders produce no commission and refund the voucher/stock.
cancel=post(users[0],{**payload,'requestId':prefix+'cancel','code':''})['orderId']
post(users[0],{'action':'cancelOrder','id':cancel})
assert db.execute('SELECT COUNT(*) FROM MarketAffiliateCommission WHERE orderId=?',(cancel,)).fetchone()[0]==0
print('PASS staging HTTP: checkout + voucher allocation, order idempotency, F1-F9 on net sales, business 1%, cancellation, private/account and admin reports')

from urllib.parse import urlencode
def get_admin(action,**params):
    url='http://127.0.0.1:3064/api/market?'+urlencode({'action':action,**params})
    req=urllib.request.Request(url,headers={'Cookie':'yw_market_session='+tokens[admin]})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
for uid in [users[0],None]:
    for action in ['affiliateAdmin','affiliateExport','affiliateMembers','affiliateMember','affiliateStores']:
        req=urllib.request.Request('http://127.0.0.1:3064/api/market?action='+action,headers={'Cookie':'yw_market_session='+tokens[uid]} if uid else {})
        try:urllib.request.urlopen(req,timeout=30);raise AssertionError('Admin data accessible without admin role')
        except urllib.error.HTTPError as error:assert error.code==403
code,_=request(users[0],{'action':'affiliateConfirmPayment'});assert code==403
code,_=request(users[0],{'action':'affiliateAssignStore'});assert code==403
second=post(users[0],{**payload,'requestId':prefix+'second','code':''})['orderId']
for state in ['CONFIRMED','SHIPPED','COMPLETED']:post(admin,{'action':'orderStatus','id':second,'status':state})
report=get_admin('affiliateAdmin',beneficiaryId=users[1]);assert report['totals']['earned']==19000;assert report['totals']['entries']==2
assert get_admin('affiliateAdmin',beneficiaryId=users[9],level='9')['totals']['earned']==9500
members=get_admin('affiliateMembers',q=users[1]+'@example.invalid');assert len(members['members'])==1
tree=get_admin('affiliateMember',id=users[10]);assert [int(x['level']) for x in tree['levels']]==list(range(1,10))
post(admin,{'action':'affiliateAssignStore','storeId':store,'refCode':users[8],'reason':'QA: correct business introducer'})
assert db.execute('SELECT affiliateReferrerId FROM MarketStore WHERE id=?',(store,)).fetchone()[0]==users[8]
assert db.execute('SELECT beneficiaryId FROM MarketAffiliateOrderBusiness WHERE orderId=?',(order,)).fetchone()[0]==users[10]
assert db.execute('SELECT referredById FROM User WHERE id=?',(vendor,)).fetchone()[0]==users[10]
stores=get_admin('affiliateStores');assert any(a['storeId']==store and a['actorId']==admin for a in stores['audits'])
ids=[row['id'] for row in report['commissions']]
payment={'action':'affiliateConfirmPayment','ids':ids,'expectedAmount':19000,'reference':'STAGE-BANK-001','note':'Staging proof only','requestId':prefix+'pay','confirmed':True}
code,_=request(admin,{**payment,'confirmed':False});assert code==400
code,_=request(admin,{**payment,'expectedAmount':99999});assert code==400
paid=post(admin,payment);assert paid['amount']==19000;assert post(admin,payment)['alreadyConfirmed'] is True
code,_=request(admin,{**payment,'requestId':prefix+'pay-again'});assert code==400
paid_report=get_admin('affiliateAdmin',beneficiaryId=users[1],status='PAID');assert paid_report['totals']['paid']==19000;assert paid_report['totals']['entries']==2
assert all(row['paymentReference']=='STAGE-BANK-001' and row['paidBy']==admin for row in paid_report['commissions'])
_,account=request(users[1]);assert account['account']['affiliate']['totals']['accrued']==0
assert account['account']['affiliate']['totals']['earned']==19000
req=urllib.request.Request('http://127.0.0.1:3064/api/market?'+urlencode({'action':'affiliateExport','beneficiaryId':users[1]}),headers={'Cookie':'yw_market_session='+tokens[admin]})
with urllib.request.urlopen(req,timeout=30) as response:
    assert 'text/csv' in response.headers['Content-Type'];csv=response.read().decode('utf-8-sig');assert 'STAGE-BANK-001' in csv and 'Affiliate QA' in csv
other=get_admin('affiliateAdmin',beneficiaryId=users[2]);other_ids=[row['id'] for row in other['commissions']]
other_payment={**payment,'ids':other_ids,'expectedAmount':9500,'requestId':prefix+'rollback'}
db.execute("CREATE TRIGGER affiliate_qa_audit_failure BEFORE INSERT ON MarketAudit WHEN NEW.action='affiliate:payment' BEGIN SELECT RAISE(ABORT,'QA rollback'); END");db.commit()
code,_=request(admin,other_payment);assert code==400
assert db.execute('SELECT COUNT(*) FROM MarketAffiliatePayout WHERE requestId=?',(other_payment['requestId'],)).fetchone()[0]==0
assert get_admin('affiliateAdmin',beneficiaryId=users[2])['totals']['accrued']==9500
db.execute('DROP TRIGGER affiliate_qa_audit_failure');db.commit();post(admin,other_payment)
print('PASS admin HTTP: role restrictions, filters, members and F1-F9, immutable merchant snapshots, proof and amount verification, payment idempotency, CSV, forced rollback, shared user balances')
