"""Run only against a disposable clone on staging port 3064."""
import sys, sqlite3, json, uuid, time, hashlib, urllib.request, urllib.error, copy, subprocess, html

dbfile=sys.argv[1]
assert 'policies-admin-stage-' in dbfile, 'Only staging databases allowed'
db=sqlite3.connect(dbfile,timeout=30)
base='http://127.0.0.1:3064'; origin='http://localhost:3064'
stamp=int(time.time()*1000)
password_hash=subprocess.check_output(['node','-e',"console.log(require('bcryptjs').hashSync(process.argv[1],10))",'PolicyQa@2026'],text=True).strip()
tokens={}
for role in ['ADMIN','MEMBER']:
    uid='policy-qa-'+role.lower(); email='policy-'+role.lower()+'-qa@example.invalid'
    db.execute('INSERT INTO User(id,email,fullName,refCode,role,status,passwordHash,updatedAt,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',(uid,email,'Policy QA',uid,role,'ACTIVE',password_hash,stamp,stamp))
    token=uuid.uuid4().hex; tokens[role]=token
    db.execute('INSERT INTO MarketSession VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),uid,stamp+3600000,stamp))
db.commit()
bank_before=db.execute('SELECT * FROM BankDepositAccount ORDER BY id').fetchall()

def req(path='/api/market?action=policiesAdmin',role='ADMIN',body=None,request_origin=origin):
    headers={'Origin':request_origin,'Content-Type':'application/json'}
    if role: headers['Cookie']='yw_market_session='+tokens[role]
    r=urllib.request.Request(base+path,headers=headers,data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(r,timeout=30) as response:
            text=response.read().decode();return response.status,json.loads(text) if 'application/json' in response.headers.get('Content-Type','') else text
    except urllib.error.HTTPError as e:
        text=e.read().decode();return e.code,json.loads(text) if 'application/json' in e.headers.get('Content-Type','') else text

code,data=req();assert code==200,(code,data)
original=data['bundle'];assert len(original['documents'])==7
def publish(b,version=None,role='ADMIN',request_origin=origin):
    return req('/api/market',role,{'action':'policiesPublish','bundle':b,'expectedVersion':original['version'] if version is None else version},request_origin)
for role in [None,'MEMBER']:
    assert req(role=role)[0]==403
    assert publish(original,role=role)[0] in [401,403]
assert publish(original,request_origin='https://evil.example')[0]==403
assert db.execute("SELECT value FROM MarketSetting WHERE key='policies:published:v1'").fetchone() is None

for kind in ['bank','date','duplicate','missing_bank','email','phone','large']:
    b=copy.deepcopy(original)
    if kind=='bank':b['bank']['accountNumber']='not-a-number'
    if kind=='date':b['documents'][0]['effectiveDate']='2026-02-31'
    if kind=='duplicate':b['documents'][1]['slug']=b['documents'][0]['slug']
    if kind=='missing_bank':
        for s in b['documents'][2]['sections']:s['bank']=False
    if kind=='email':b['company']['email']='javascript:alert(1)'
    if kind=='phone':b['company']['phone']='javascript:123456789'
    if kind=='large':b['documents'][0]['intro']='x'*6001
    assert publish(b)[0]==400,kind

b=copy.deepcopy(original)
b['company'].update(name='CÔNG TY KIỂM THỬ CHÍNH SÁCH',taxCode='0123456789',address='Địa chỉ thử nghiệm riêng',phone='0901 234 567',email='policies@example.invalid')
b['bank'].update(bankName='Ngân hàng thử nghiệm',bankCode='TEST',accountNumber='001234567890',accountName='CONG TY KIEM THU')
b['documents'][0].update(title='Bảo mật tùy chỉnh QA',short='Bảo mật QA',description='Mô tả QA',intro='Đơn vị quản lý: {{company.name}} <script>alert("qa")</script>',effectiveDate='2026-10-17')
b['documents'][0]['sections'][0]['paragraphs']=['Dòng thứ nhất\nDòng thứ hai','','  ']
code,result=publish(b);assert code==200,(code,result)
saved=result['bundle'];assert saved['version']==original['version']+1
assert saved['company']['phoneHref']=='tel:0901234567'
assert publish(b)[0]==409
assert req()[1]['bundle']==saved
public=req('/api/market',None)[1]['policySite']
assert public['company']==saved['company'];assert public['bank']==saved['bank'];assert public['links'][0]['short']=='Bảo mật QA'
for slug in [None]+[d['slug'] for d in saved['documents']]:
    code,page=req('/policies'+('/'+slug if slug else ''),None);assert code==200
    assert saved['company']['name'] in page and 'policies@example.invalid' in page and 'Địa chỉ thử nghiệm riêng' in page
    assert 'Bảo mật QA' in page
    if slug=='chinh-sach-thanh-toan':
        for k in ['bankName','bankCode','accountNumber','accountName']:assert saved['bank'][k] in page
    if slug=='dieu-khoan-bao-mat':
        assert 'Bảo mật tùy chỉnh QA' in page and '17/10/2026' in page
        assert '<script>alert("qa")</script>' not in page
        assert '&lt;script&gt;' in page
assert req('/policies/invalid-policy',None)[0]==404
assert db.execute('SELECT * FROM BankDepositAccount ORDER BY id').fetchall()==bank_before
assert db.execute("SELECT COUNT(*) FROM MarketAudit WHERE action='policies:publish'").fetchone()[0]==1

# An audit failure rolls back both content and bank changes.
db.execute("CREATE TRIGGER policies_qa_audit_failure BEFORE INSERT ON MarketAudit WHEN NEW.action='policies:publish' BEGIN SELECT RAISE(ABORT,'QA rollback'); END");db.commit()
bad=copy.deepcopy(saved);bad['bank']['accountNumber']='99999999'
assert publish(bad,version=saved['version'])[0]==400
assert req()[1]['bundle']==saved
db.execute('DROP TRIGGER policies_qa_audit_failure');db.commit()
# Restore staging public content, retaining a known admin login for visual QA.
code,result=publish(original,version=saved['version']);assert code==200,(code,result)
assert db.execute('SELECT * FROM BankDepositAccount ORDER BY id').fetchall()==bank_before
print('PASS policies CMS: admin-only read/write, CSRF origin, validation, persisted publish, optimistic version conflict, dynamic public pages/navigation/company/bank, literal HTML escaping, 404, audit rollback, HUB bank isolation; staging content restored')
