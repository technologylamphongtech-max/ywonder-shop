"""Align historical Phong Châu COMBO rows with the no-delivery, COMBO-only policy.

Creates an additive adjustment record so historical commission rows remain
intact while all payout and balance queries exclude the voided amount.
"""

import argparse
import sqlite3
import time
import uuid
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('database',type=Path)
parser.add_argument('backup',type=Path)
args=parser.parse_args()

SHIPPED='385f6f97-62b3-4c98-85a0-930f70a8e03a'
COMPLETED='b7407dd7-4ee3-4bc8-8b77-3d87a16c755f'
COMBO='6b51090b-767b-4fc7-89e4-83fa5704c454'
STORE='70297741-e78b-4ef9-b659-80fc513330a8'

assert args.database.is_file() and not args.backup.exists()
db=sqlite3.connect(str(args.database),timeout=20)
db.row_factory=sqlite3.Row
try:
    assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    admin=db.execute("SELECT id FROM User WHERE role='ADMIN' ORDER BY id LIMIT 1").fetchone()
    assert admin,'Missing audit actor'
    order=db.execute('SELECT o.id,o.userId,o.status,o.shipping,p.status paymentStatus,p.storeId paymentStoreId FROM MarketOrder o JOIN MarketOrderBankPayment p ON p.orderId=o.id WHERE o.id=?',(SHIPPED,)).fetchone()
    assert order and order['status']=='SHIPPED' and order['shipping']==0 and order['paymentStatus']=='VERIFIED' and order['paymentStoreId']=='','Historical order changed; review manually'
    assert db.execute('SELECT COUNT(*) FROM MarketOrderItem WHERE orderId=? AND productId=? AND storeId=?',(SHIPPED,COMBO,STORE)).fetchone()[0]==1
    assert db.execute('SELECT COUNT(*) FROM MarketOrderItem WHERE orderId=?',(SHIPPED,)).fetchone()[0]==1
    assert db.execute('SELECT COUNT(*) FROM MarketGhnShipment WHERE orderId=?',(SHIPPED,)).fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM MarketSettlement WHERE orderId=?',(SHIPPED,)).fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM MarketSellerFulfilment WHERE orderId=?',(SHIPPED,)).fetchone()[0]==0
    paid=db.execute('SELECT status FROM MarketOrder WHERE id=?',(COMPLETED,)).fetchone()
    assert paid and paid['status']=='COMPLETED'
    old_commissions=db.execute("SELECT id,beneficiaryId,amount,status,payoutId FROM MarketAffiliateCommission WHERE orderId=? AND sourceKey='buyer' AND rateBps=100",(COMPLETED,)).fetchall()
    assert len(old_commissions)==1 and old_commissions[0]['status']=='ACCRUED' and not old_commissions[0]['payoutId'] and old_commissions[0]['amount']==25000,'Legacy commission changed; review manually'
    assert db.execute('SELECT COUNT(*) FROM MarketAffiliateCommission WHERE orderId=?',(COMPLETED,)).fetchone()[0]==1
    args.backup.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(str(args.backup)) as backup:
        db.backup(backup)
        assert backup.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    stamp=int(time.time()*1000)
    db.execute('BEGIN IMMEDIATE')
    changed=db.execute("UPDATE MarketOrder SET status='CONFIRMED' WHERE id=? AND status='SHIPPED'",(SHIPPED,)).rowcount
    assert changed==1
    db.execute('CREATE TABLE IF NOT EXISTS MarketAffiliateCommissionVoid(commissionId TEXT PRIMARY KEY, reason TEXT NOT NULL, createdBy TEXT NOT NULL, created BIGINT NOT NULL)')
    assert db.execute('SELECT COUNT(*) FROM MarketAffiliateCommissionVoid WHERE commissionId=?',(old_commissions[0]['id'],)).fetchone()[0]==0
    changed=db.execute('INSERT INTO MarketAffiliateCommissionVoid(commissionId,reason,createdBy,created) VALUES(?,?,?,?)',(old_commissions[0]['id'],'Đơn COMBO cũ không đủ điều kiện hưởng hoa hồng affiliate 1%',admin['id'],stamp)).rowcount
    assert changed==1
    for action,target in [('legacy-combo:no-delivery-reset',SHIPPED),('legacy-combo:legacy-commission-void',old_commissions[0]['id'])]:
        db.execute('INSERT INTO MarketAudit(id,userId,action,target,created) VALUES(?,?,?,?,?)',(str(uuid.uuid4()),admin['id'],action,target,stamp))
    db.execute('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',(str(uuid.uuid4()),order['userId'],'Cập nhật đơn COMBO Phong Châu','Đơn COMBO đã được xác nhận chuyển khoản và không có bước giao hàng. Gian hàng sẽ hoàn tất đơn sau khi đối soát.',stamp))
    db.execute('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',(str(uuid.uuid4()),old_commissions[0]['beneficiaryId'],'Điều chỉnh hoa hồng COMBO cũ','Khoản hoa hồng 1% chưa thanh toán của đơn COMBO cũ đã được hủy. COMBO chỉ áp dụng hoa hồng 20% cho F1 có link giới thiệu hợp lệ.',stamp))
    db.commit()
    assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    assert db.execute('SELECT status FROM MarketOrder WHERE id=?',(SHIPPED,)).fetchone()[0]=='CONFIRMED'
    assert db.execute('SELECT status FROM MarketAffiliateCommission WHERE id=?',(old_commissions[0]['id'],)).fetchone()[0]=='ACCRUED'
    assert db.execute('SELECT COUNT(*) FROM MarketAffiliateCommissionVoid WHERE commissionId=?',(old_commissions[0]['id'],)).fetchone()[0]==1
    print('Reconciled one historical COMBO order and one unpaid legacy commission; original bank payment preserved.')
    print('Backup:',args.backup)
finally:
    db.close()
