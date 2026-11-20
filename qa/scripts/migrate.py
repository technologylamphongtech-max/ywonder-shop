import sqlite3,sys,json
from pathlib import Path
db=sqlite3.connect(sys.argv[1],timeout=30)
db.execute('PRAGMA foreign_keys=ON')
db.executescript('''
CREATE TABLE IF NOT EXISTS MarketSession(token TEXT PRIMARY KEY,userId TEXT NOT NULL,expires BIGINT NOT NULL,created BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS MarketSession_user ON MarketSession(userId);
CREATE TABLE IF NOT EXISTS MarketRate(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketProfile(userId TEXT PRIMARY KEY,interests TEXT NOT NULL DEFAULT '[]',address TEXT NOT NULL DEFAULT '',notifications INTEGER NOT NULL DEFAULT 1,points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0));
CREATE TABLE IF NOT EXISTS MarketCategory(id TEXT PRIMARY KEY,name TEXT NOT NULL,sort INTEGER NOT NULL,featured INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS MarketStore(id TEXT PRIMARY KEY,userId TEXT NOT NULL UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,taxCode TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'PENDING',feeBps INTEGER,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketProduct(id TEXT PRIMARY KEY,storeId TEXT REFERENCES MarketStore(id),categoryId TEXT NOT NULL REFERENCES MarketCategory(id),name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price INTEGER NOT NULL CHECK(price>=0),stock INTEGER NOT NULL CHECK(stock>=0),image TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 0,created BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS MarketProduct_category ON MarketProduct(categoryId,active);
CREATE TABLE IF NOT EXISTS MarketContent(id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',code TEXT NOT NULL DEFAULT '',discountBps INTEGER NOT NULL DEFAULT 0,starts BIGINT NOT NULL DEFAULT 0,ends BIGINT NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketFavorite(userId TEXT NOT NULL,productId TEXT NOT NULL REFERENCES MarketProduct(id),PRIMARY KEY(userId,productId));
CREATE TABLE IF NOT EXISTS MarketOrder(id TEXT PRIMARY KEY,userId TEXT NOT NULL,requestId TEXT NOT NULL,total INTEGER NOT NULL,discount INTEGER NOT NULL,shipping INTEGER NOT NULL,rewardPoints INTEGER NOT NULL,redeemed INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'PENDING',created BIGINT NOT NULL,UNIQUE(userId,requestId));
CREATE TABLE IF NOT EXISTS MarketOrderItem(id TEXT PRIMARY KEY,orderId TEXT NOT NULL REFERENCES MarketOrder(id),productId TEXT NOT NULL REFERENCES MarketProduct(id),storeId TEXT,name TEXT NOT NULL,quantity INTEGER NOT NULL,price INTEGER NOT NULL,net INTEGER NOT NULL,feeBps INTEGER NOT NULL,fee INTEGER NOT NULL,sellerNet INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS MarketLedger(id TEXT PRIMARY KEY,userId TEXT NOT NULL,orderId TEXT,amount INTEGER NOT NULL,kind TEXT NOT NULL,created BIGINT NOT NULL,UNIQUE(orderId,kind));
CREATE TABLE IF NOT EXISTS MarketSettlement(id TEXT PRIMARY KEY,storeId TEXT NOT NULL,orderId TEXT NOT NULL,itemId TEXT NOT NULL UNIQUE,gross INTEGER NOT NULL,fee INTEGER NOT NULL,net INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketNotification(id TEXT PRIMARY KEY,userId TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketSetting(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketAudit(id TEXT PRIMARY KEY,userId TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketAttendance(userId TEXT NOT NULL,day TEXT NOT NULL,streak INTEGER NOT NULL,amount INTEGER NOT NULL,created BIGINT NOT NULL,PRIMARY KEY(userId,day));
CREATE TABLE IF NOT EXISTS MarketTaskDefinition(id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',reward INTEGER NOT NULL,goal INTEGER NOT NULL DEFAULT 1,limitPerDay INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketTaskProgress(userId TEXT NOT NULL,taskId TEXT NOT NULL,day TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,rewarded INTEGER NOT NULL DEFAULT 0,created BIGINT NOT NULL,updated BIGINT NOT NULL,PRIMARY KEY(userId,taskId,day));
CREATE TABLE IF NOT EXISTS MarketTaskEvent(id TEXT PRIMARY KEY,userId TEXT NOT NULL,taskId TEXT NOT NULL,day TEXT NOT NULL,ref TEXT NOT NULL,created BIGINT NOT NULL,UNIQUE(userId,taskId,day,ref));
CREATE TABLE IF NOT EXISTS MarketHub(id TEXT PRIMARY KEY,name TEXT NOT NULL,qrToken TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,qrExpires BIGINT NOT NULL DEFAULT 0,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketHubCheckin(id TEXT PRIMARY KEY,userId TEXT NOT NULL,hubId TEXT NOT NULL,day TEXT NOT NULL,qrToken TEXT NOT NULL,reward INTEGER NOT NULL,created BIGINT NOT NULL,UNIQUE(userId,hubId,day));
CREATE TABLE IF NOT EXISTS MarketVoucherCampaign(id TEXT PRIMARY KEY,title TEXT NOT NULL,code TEXT NOT NULL UNIQUE,faceValue INTEGER NOT NULL,pointsCost INTEGER NOT NULL,stock INTEGER NOT NULL,perUser INTEGER NOT NULL DEFAULT 1,starts BIGINT NOT NULL DEFAULT 0,ends BIGINT NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketVoucher(id TEXT PRIMARY KEY,campaignId TEXT NOT NULL,userId TEXT NOT NULL,code TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'UNUSED',faceValue INTEGER NOT NULL,expires BIGINT NOT NULL DEFAULT 0,usedAt BIGINT NOT NULL DEFAULT 0,orderId TEXT NOT NULL DEFAULT '',created BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS MarketYwbTransfer(id TEXT PRIMARY KEY,userId TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',idempotency TEXT NOT NULL,sourceRef TEXT NOT NULL DEFAULT '',targetRef TEXT NOT NULL DEFAULT '',created BIGINT NOT NULL,updated BIGINT NOT NULL,UNIQUE(userId,idempotency));
CREATE TABLE IF NOT EXISTS MarketMembershipTier(id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,minSpend INTEGER NOT NULL DEFAULT 0,minOrders INTEGER NOT NULL DEFAULT 0,benefits TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS MarketReferral(id TEXT PRIMARY KEY,referrerId TEXT NOT NULL,referredId TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'PENDING',created BIGINT NOT NULL);
''')

def add_column(table,column,definition):
    existing={row[1] for row in db.execute(f'PRAGMA table_info({table})')}
    if column not in existing:
        db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')

add_column('MarketProfile','ywbBalance','INTEGER NOT NULL DEFAULT 0')
add_column('MarketProfile','hubAccountId',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','hubLinkedAt','BIGINT NOT NULL DEFAULT 0')
add_column('MarketProfile','attendanceStreak','INTEGER NOT NULL DEFAULT 0')
add_column('MarketProfile','attendanceLast',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','hubStreak','INTEGER NOT NULL DEFAULT 0')
add_column('MarketProfile','hubLast',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','street',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','provinceCode',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','provinceName',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','wardCode',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','wardName',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','zipCode',"TEXT NOT NULL DEFAULT ''")
add_column('MarketProfile','addressDetail',"TEXT NOT NULL DEFAULT ''")
add_column('MarketOrder','ywbUsed','INTEGER NOT NULL DEFAULT 0')
add_column('MarketOrder','voucherId',"TEXT NOT NULL DEFAULT ''")
categories=['Thiết Bị Điện Tử','Phụ Kiện Điện Tử','TV & Thiết Bị Điện Gia Dụng','Sức Khỏe & Làm Đẹp','Hàng Mẹ, Bé & Đồ Chơi','Siêu Thị Tạp Hóa','Hàng Gia dụng & Đời sống','Thời trang & Phụ kiện Nữ','Thời trang & Phụ kiện Nam','Thời trang & Phụ kiện Trẻ Em','Thể Thao & Du Lịch','Ôtô, Xe Máy & Thiết Bị Định Vị']
slugs=['thiet-bi-dien-tu','phu-kien-dien-tu','tv-thiet-bi-dien-gia-dung','suc-khoe-lam-dep','hang-me-be-do-choi','sieu-thi-tap-hoa','hang-gia-dung-doi-song','thoi-trang-phu-kien-nu','thoi-trang-phu-kien-nam','thoi-trang-phu-kien-tre-em','the-thao-du-lich','oto-xe-may-thiet-bi-dinh-vi']
for i,(slug,name) in enumerate(zip(slugs,categories)):
 db.execute('INSERT OR IGNORE INTO MarketCategory(id,name,sort,featured) VALUES(?,?,?,?)',(slug,name,i,int(i in [0,3,5,6,7,10])))
legacy_map={'dien-tu':'thiet-bi-dien-tu','thoi-trang':'thoi-trang-phu-kien-nu','my-pham':'suc-khoe-lam-dep','gia-dung':'tv-thiet-bi-dien-gia-dung','noi-that':'hang-gia-dung-doi-song','me-be':'hang-me-be-do-choi','suc-khoe':'suc-khoe-lam-dep','thuc-pham':'sieu-thi-tap-hoa','nong-san':'sieu-thi-tap-hoa','dac-san-vung-mien':'sieu-thi-tap-hoa','sach':'hang-gia-dung-doi-song','van-phong-pham':'hang-gia-dung-doi-song','the-thao':'the-thao-du-lich','o-to-xe-may':'oto-xe-may-thiet-bi-dinh-vi','thu-cung':'sieu-thi-tap-hoa','cay-canh':'hang-gia-dung-doi-song'}
for old,new in legacy_map.items():
 db.execute('UPDATE MarketProduct SET categoryId=? WHERE categoryId=?',(new,old))
db.execute("UPDATE MarketCategory SET active=0 WHERE id IN (%s)" % ','.join('?'*len(legacy_map)),tuple(legacy_map))
settings={'feeBps':0,'rewardBps':0,'shipping':0,'pointValue':1,'aiProvider':'none','aiModel':'','aiEnabled':False,
          'ywbEnabled':False,'ywbToVnd':0,'ywbMinTransfer':1,'ywbMaxTransfer':1000000,'ywbDailyLimit':1000000,
          'xuEnabled':True,'xuVndRate':5,'xuMaxDiscount':0,'allowXuWithYwb':False,'allowVoucherWithYwb':True,
          'attendanceDaily':30,'attendanceWeekly':500,'attendanceMonthly':3000}
db.execute('INSERT OR IGNORE INTO MarketSetting VALUES(?,?)',('commerce',json.dumps(settings)))
tasks=[
 ('task-attendance','attendance','Điểm danh hôm nay','Bấm điểm danh một lần trong ngày',0,1,1),
 ('task-view-products','view_products','Xem 3 sản phẩm','Mở trang chi tiết của 3 sản phẩm khác nhau',10,3,1),
 ('task-watch-video','watch_video','Xem 1 video','Xem đủ thời lượng video theo cấu hình',10,1,1),
 ('task-order','order_completed','Thực hiện 1 đơn hàng','Đơn đạt trạng thái hoàn tất',50,1,1),
 ('task-invite','invite_friend','Mời bạn bè','Bạn được mời hoàn thành đăng ký hợp lệ',100,1,1),
 ('task-hub-visit','hub_visit','Ghé YWONDER HUB','Check-in tại HUB bằng QR hợp lệ',50,1,1),
 ('task-hub-qr','hub_qr','Quét QR tại HUB','Quét mã QR HUB hợp lệ',30,1,1),
]
import time
stamp=lambda: int(time.time()*1000)
for row in tasks:
    db.execute('INSERT INTO MarketTaskDefinition(id,key,title,description,reward,goal,limitPerDay,active,created) VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT(key) DO UPDATE SET title=excluded.title,description=excluded.description,reward=excluded.reward,goal=excluded.goal,limitPerDay=excluded.limitPerDay',(*row, stamp()))
tiers=[('tier-bronze','BRONZE','Bronze',0,0,'Quyền lợi cơ bản',0),('tier-silver','SILVER','Silver',1000000,3,'Ưu đãi Silver',1),('tier-gold','GOLD','Gold',5000000,10,'Ưu đãi Gold',2),('tier-diamond','DIAMOND','Diamond',20000000,30,'Ưu đãi Diamond',3)]
for row in tiers:
    db.execute('INSERT OR IGNORE INTO MarketMembershipTier(id,key,name,minSpend,minOrders,benefits,sort) VALUES(?,?,?,?,?,?,?)',row)
db.commit()
print('Market migration complete; existing tables unchanged')
