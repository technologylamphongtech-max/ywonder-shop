import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'crypto';
import {spawn} from 'child_process';

type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};
type Details={idNumber:string;fullName:string;birthDate:string;address:string};

function cipherKey(){const secret=process.env.MARKET_SECRET;if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new Error('Chưa có khóa bảo vệ hồ sơ KYC');return createHash('sha256').update('ywondershop-withdrawal-kyc-v1:').update(secret).digest()}
function seal(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey(),iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64')}
function open(value:string){const bytes=Buffer.from(value,'base64'),iv=bytes.subarray(0,12),tag=bytes.subarray(bytes.length-16),cipher=createDecipheriv('aes-256-gcm',cipherKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes.subarray(12,bytes.length-16)),cipher.final()]).toString('utf8')}

function image(value:unknown){
 if(typeof value!=='string'||value.length>2800000)throw new Error('Ảnh CCCD không hợp lệ hoặc vượt quá 2 MB');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match)throw new Error('Ảnh CCCD phải là PNG, JPG hoặc WebP');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length<10000||bytes.length>2000000)throw new Error('Mỗi ảnh CCCD phải từ 10 KB đến 2 MB');
 const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!valid)throw new Error('Nội dung ảnh không khớp định dạng đã chọn');
 return {data:value,bytes};
}

function ocrOne(bytes:Buffer):Promise<string>{return new Promise((resolve,reject)=>{
 const child=spawn('/usr/bin/tesseract',['stdin','stdout','-l','vie+eng','--psm','6'],{stdio:['pipe','pipe','ignore']});let output='';
 const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Nhận diện ảnh quá thời gian. Vui lòng thử ảnh rõ nét hơn'))},20000);
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>30000)child.kill('SIGKILL')});
 child.on('error',error=>{clearTimeout(timer);reject(error)});
 child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.slice(0,30000)):reject(new Error('Không nhận diện được ảnh CCCD. Vui lòng tải ảnh rõ nét hơn'))});
 child.stdin.on('error',()=>{});child.stdin.end(bytes);
})}

function extract(front:string,back:string):Details{
 const lines=front.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),all=front+'\n'+back;
 const compact=all.replace(/(?<=\d)[\s.-](?=\d)/g,'');
 const idNumber=(compact.match(/\b\d{12}\b/)||[])[0]||'';
 const birthLine=lines.find(line=>/ngày.*sinh|date.*birth/i.test(line))||'';
 const birthDate=(birthLine.match(/\b\d{2}[/.\-]\d{2}[/.\-]\d{4}\b/)||front.match(/\b\d{2}[/.\-]\d{2}[/.\-]\d{4}\b/)||[])[0]?.replace(/[.\-]/g,'/')||'';
 const nameAt=lines.findIndex(line=>/họ.*tên|full\s*name/i.test(line));
 let fullName=nameAt<0?'':lines[nameAt].replace(/^.*?(?:họ.*tên|full\s*name)\s*[:：]?\s*/i,'').trim();
 if(!fullName&&nameAt>=0)fullName=lines[nameAt+1]||'';
 fullName=fullName.replace(/[0-9]+/g,'').trim().slice(0,120);
 const addressAt=lines.findIndex(line=>/nơi thường trú|place of residence|địa chỉ thường trú/i.test(line));
 let address=addressAt<0?'':lines.slice(addressAt,addressAt+3).join(' ').replace(/^.*?(?:nơi thường trú|place of residence|địa chỉ thường trú)\s*[:：]?\s*/i,'').trim();
 address=address.slice(0,300);
 return {idNumber,fullName,birthDate,address};
}

export async function recognizeWithdrawalCccd(frontValue:unknown,backValue:unknown){
 const front=image(frontValue),back=image(backValue);
 const [frontText,backText]=await Promise.all([ocrOne(front.bytes),ocrOne(back.bytes)]);
 return {details:extract(frontText,backText),frontText:frontText.slice(0,4000),backText:backText.slice(0,4000)};
}

export async function submitWithdrawalKyc(tx:Sql,userId:string,body:any){
 const front=image(body.front),back=image(body.back);
 const idNumber=String(body.idNumber||'').replace(/\s/g,'');
 const fullName=String(body.fullName||'').trim();
 const birthDate=String(body.birthDate||'').trim();
 const address=String(body.address||'').trim();
 if(!/^\d{12}$/.test(idNumber))throw new Error('Số CCCD phải có 12 chữ số');
 if(fullName.length<2||fullName.length>120||address.length<5||address.length>300||!/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate))throw new Error('Vui lòng kiểm tra họ tên, ngày sinh và địa chỉ trên CCCD');
 if(body.confirmed!==true)throw new Error('Vui lòng xác nhận thông tin CCCD đã kiểm tra');
 const previous=(await tx.$queryRawUnsafe('SELECT status FROM MarketWithdrawalKyc WHERE userId=? ORDER BY submittedAt DESC LIMIT 1',userId))[0];
 if(previous?.status==='APPROVED')throw new Error('Hồ sơ KYC của bạn đã được duyệt');
 if(previous?.status==='PENDING')throw new Error('Hồ sơ KYC đang chờ admin duyệt');
 const id=randomUUID(),stamp=Date.now(),details:Details={idNumber,fullName,birthDate,address};
 await tx.$executeRawUnsafe('INSERT INTO MarketWithdrawalKyc(id,userId,status,detailsCipher,frontCipher,backCipher,submittedAt) VALUES(?,?,?,?,?,?,?)',id,userId,'PENDING',seal(JSON.stringify(details)),seal(front.data),seal(back.data),stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'withdrawal-kyc:submitted',id,stamp);
 return {id,status:'PENDING'};
}

export async function withdrawalKycStatus(tx:Sql,userId:string){
 const row=(await tx.$queryRawUnsafe('SELECT id,status,detailsCipher,submittedAt,reviewedAt,reviewNote FROM MarketWithdrawalKyc WHERE userId=? ORDER BY submittedAt DESC LIMIT 1',userId))[0];
 return row?{id:row.id,status:row.status,details:JSON.parse(open(row.detailsCipher)),submittedAt:row.submittedAt,reviewedAt:row.reviewedAt,reviewNote:row.reviewNote}:{status:'NOT_SUBMITTED'};
}

export async function requireWithdrawalKyc(tx:Sql,userId:string){
 const row=(await tx.$queryRawUnsafe('SELECT status FROM MarketWithdrawalKyc WHERE userId=? ORDER BY submittedAt DESC LIMIT 1',userId))[0];
 if(row?.status!=='APPROVED')throw new Error('Cần xác minh KYC bằng ảnh CCCD hai mặt và được admin duyệt trước khi rút tiền');
}

export async function withdrawalKycAdmin(tx:Sql){
 const records=await tx.$queryRawUnsafe("SELECT k.id,k.userId,k.status,k.detailsCipher,k.submittedAt,k.reviewedAt,k.reviewNote,u.fullName accountName,u.email FROM MarketWithdrawalKyc k JOIN User u ON u.id=k.userId WHERE k.id=(SELECT x.id FROM MarketWithdrawalKyc x WHERE x.userId=k.userId ORDER BY x.submittedAt DESC LIMIT 1) ORDER BY CASE k.status WHEN 'PENDING' THEN 0 ELSE 1 END,k.submittedAt DESC LIMIT 200");
 return records.map(row=>({id:row.id,userId:row.userId,status:row.status,details:JSON.parse(open(row.detailsCipher)),submittedAt:row.submittedAt,reviewedAt:row.reviewedAt,reviewNote:row.reviewNote,accountName:row.accountName,email:row.email}));
}

export async function withdrawalKycDocument(tx:Sql,id:string,side:'front'|'back'){
 const row=(await tx.$queryRawUnsafe(`SELECT ${side==='front'?'frontCipher':'backCipher'} image FROM MarketWithdrawalKyc WHERE id=?`,id))[0];
 if(!row)throw new Error('Không tìm thấy ảnh CCCD');
 return open(row.image);
}

export async function reviewWithdrawalKyc(tx:Sql,actorId:string,body:any){
 const id=String(body.id||'').trim(),status=body.status;
 if(!id||!['APPROVED','REJECTED'].includes(status))throw new Error('Thông tin duyệt KYC không hợp lệ');
 const row=(await tx.$queryRawUnsafe("SELECT id,status FROM MarketWithdrawalKyc WHERE id=?",id))[0];
 if(!row||row.status!=='PENDING')throw new Error('Hồ sơ KYC không còn chờ duyệt');
 const note=String(body.note||'').trim().slice(0,500);
 if(status==='REJECTED'&&!note)throw new Error('Vui lòng nêu lý do cần bổ sung');
 const stamp=Date.now();
 const updated=await tx.$executeRawUnsafe("UPDATE MarketWithdrawalKyc SET status=?,reviewNote=?,reviewedAt=?,reviewedBy=? WHERE id=? AND status='PENDING'",status,note,stamp,actorId,id);
 if(updated!==1)throw new Error('Hồ sơ vừa được cập nhật');
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'withdrawal-kyc:'+status.toLowerCase(),id,stamp);
 return {id,status};
}
