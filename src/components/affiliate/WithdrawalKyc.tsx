'use client';

import {useEffect,useState} from 'react';
import styles from './WithdrawalKyc.module.css';

type Details={idNumber:string;fullName:string;birthDate:string;address:string};
type RecordStatus={id?:string;status:'NOT_SUBMITTED'|'PENDING'|'APPROVED'|'REJECTED';details?:Details;submittedAt?:number;reviewNote?:string};
const empty:Details={idNumber:'',fullName:'',birthDate:'',address:''};

async function api(action:string,body?:object){
 const response=await fetch('/api/market'+(body?'':'?action='+action),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),cache:'no-store'}:{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Không thể xử lý hồ sơ KYC');
 return data;
}

function readImage(file:File):Promise<string>{return new Promise((resolve,reject)=>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2_000_000||file.size<10_000){reject(new Error('Ảnh cần là JPG, PNG hoặc WebP, từ 10 KB đến 2 MB'));return}
 const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Không đọc được ảnh CCCD'));reader.readAsDataURL(file);
})}

export default function WithdrawalKyc(){
 const [record,setRecord]=useState<RecordStatus>({status:'NOT_SUBMITTED'}),[front,setFront]=useState(''),[back,setBack]=useState(''),[details,setDetails]=useState<Details>(empty),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[recognized,setRecognized]=useState(false);
 const refresh=async()=>{try{setRecord(await api('withdrawalKyc'))}catch(error:any){setMessage(error.message)}finally{setLoading(false)}};
 useEffect(()=>{void refresh()},[]);
 const choose=async(side:'front'|'back',file?:File)=>{if(!file)return;try{const data=await readImage(file);side==='front'?setFront(data):setBack(data);setRecognized(false);setConfirmed(false);setMessage('')}catch(error:any){setMessage(error.message)}};
 useEffect(()=>{if(!front||!back||record.status==='PENDING'||record.status==='APPROVED')return;let cancelled=false;
  setBusy(true);setMessage('Đang nhận diện thông tin trên CCCD…');
  void api('withdrawalKycOcr',{front,back}).then(result=>{if(cancelled)return;setDetails(result.details||empty);setRecognized(true);setMessage('Đã nhận diện ảnh. Hãy đối chiếu và sửa thông tin trước khi gửi.')} ).catch((error:any)=>{if(cancelled)return;setMessage(error.message+' Bạn vẫn có thể điền thông tin từ ảnh và gửi để admin kiểm tra.')}).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true};
 },[front,back,record.status]);
 const submit=async()=>{setBusy(true);setMessage('');try{await api('withdrawalKycSubmit',{front,back,...details,confirmed});setFront('');setBack('');setConfirmed(false);setRecognized(false);await refresh();setMessage('Đã gửi hồ sơ KYC. Admin sẽ kiểm tra hai mặt CCCD trước khi mở quyền rút tiền.')}catch(error:any){setMessage(error.message)}finally{setBusy(false)}};
 const status=record.status;
 return <section className={styles.panel} aria-label="Xác minh KYC để rút tiền">
  <div className={styles.heading}><div><span className={styles.eyebrow}>BẢO VỆ TÀI KHOẢN</span><h3>Xác minh KYC để rút hoa hồng</h3><p>Tải ảnh căn cước công dân mặt trước và mặt sau. Hệ thống nhận diện thông tin để bạn kiểm tra; admin duyệt hồ sơ trước khi cho phép rút tiền.</p></div><span className={styles.status}>{status==='APPROVED'?'Đã xác minh':status==='PENDING'?'Đang chờ duyệt':status==='REJECTED'?'Cần bổ sung':'Chưa xác minh'}</span></div>
  {loading?<p>Đang tải trạng thái KYC…</p>:status==='APPROVED'||status==='PENDING'?<div className={styles.saved}><p>{status==='APPROVED'?'Hồ sơ đã được duyệt. Bạn có thể liên kết ngân hàng và gửi lệnh rút.':'Hồ sơ đang chờ admin kiểm tra. Chưa thể tạo lệnh rút.'}</p>{record.details&&<p><b>{record.details.fullName}</b> · CCCD kết thúc bằng {record.details.idNumber.slice(-4)}</p>}{record.id&&<div className={styles.previews}><img src={`/api/market?action=withdrawalKycDocument&id=${encodeURIComponent(record.id)}&side=front`} alt="CCCD mặt trước đã gửi"/><img src={`/api/market?action=withdrawalKycDocument&id=${encodeURIComponent(record.id)}&side=back`} alt="CCCD mặt sau đã gửi"/></div>}</div>:<>
   {status==='REJECTED'&&<p className={styles.alert}>Cần bổ sung hồ sơ: {record.reviewNote||'Ảnh hoặc thông tin chưa đủ rõ. Vui lòng tải lại hai mặt CCCD.'}</p>}
   <div className={styles.uploads}><label>Mặt trước CCCD<input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={e=>void choose('front',e.target.files?.[0])}/>{front&&<img src={front} alt="Xem trước CCCD mặt trước"/>}</label><label>Mặt sau CCCD<input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={e=>void choose('back',e.target.files?.[0])}/>{back&&<img src={back} alt="Xem trước CCCD mặt sau"/>}</label></div>
   <p className={styles.hint}>Chụp rõ toàn bộ thẻ, không lóa sáng. Mỗi ảnh tối đa 2 MB. Ảnh chỉ bạn và admin có quyền xem.</p>
   {(front&&back)&&<div className={styles.fields}><p>{busy?'Đang nhận diện ảnh…':recognized?'Thông tin tự nhận diện — vui lòng đối chiếu với CCCD':'Điền đúng thông tin trên CCCD để admin đối chiếu'}</p><label>Họ và tên<input value={details.fullName} onChange={e=>setDetails({...details,fullName:e.target.value})} maxLength={120} autoComplete="name"/></label><label>Số CCCD<input value={details.idNumber} onChange={e=>setDetails({...details,idNumber:e.target.value.replace(/\D/g,'').slice(0,12)})} inputMode="numeric" maxLength={12}/></label><label>Ngày sinh (dd/mm/yyyy)<input value={details.birthDate} onChange={e=>setDetails({...details,birthDate:e.target.value})} placeholder="dd/mm/yyyy"/></label><label>Địa chỉ thường trú<input value={details.address} onChange={e=>setDetails({...details,address:e.target.value})} maxLength={300}/></label><label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Tôi đã kiểm tra thông tin và xác nhận hai ảnh là CCCD của mình.</label><button type="button" disabled={busy||!confirmed} onClick={()=>void submit()}>Gửi hồ sơ xác minh</button></div>}
  </>}
  {message&&<p role="status" className={styles.message}>{message}</p>}
 </section>;
}
