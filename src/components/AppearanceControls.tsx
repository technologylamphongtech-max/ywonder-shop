'use client';
import {useEffect,useState} from 'react';

export default function AppearanceControls(){
 const [authenticated,setAuthenticated]=useState<boolean|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  document.documentElement.dataset.ywArea=location.pathname.startsWith('/admin')?'admin':'shop';
  const controller=new AbortController();
  let updatedByPage=false;
  const sync=(event:Event)=>{updatedByPage=true;setAuthenticated(Boolean((event as CustomEvent<{authenticated:boolean}>).detail?.authenticated))};
  window.addEventListener('yw-shop-auth',sync);
  fetch('/api/market?action=authStatus',{cache:'no-store',signal:controller.signal})
   .then(response=>response.ok?response.json():Promise.reject(new Error('Không tải được trạng thái tài khoản')))
   .then(data=>{if(!updatedByPage)setAuthenticated(Boolean(data.authenticated))})
   .catch(()=>{if(!controller.signal.aborted&&!updatedByPage)setAuthenticated(false)});
  return()=>{controller.abort();window.removeEventListener('yw-shop-auth',sync)};
 },[]);
 async function logout(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/market',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
   if(!response.ok)throw new Error('Không thể đăng xuất. Vui lòng thử lại.');
   location.assign('/');
  }catch(e){setError(e instanceof Error?e.message:'Không thể đăng xuất.');setBusy(false)}
 }
 return <div className="appearance-toolbar"><div className="appearance-inner"><a className="appearance-home" href="/">Trang Chủ</a><div className="appearance-options" aria-label="Tài khoản">{authenticated===null?null:authenticated?<><a className="appearance-action" href="/?view=account">Tài khoản</a><button className="appearance-action appearance-register" type="button" onClick={logout} disabled={busy}>{busy?'Đang đăng xuất…':'Đăng xuất'}</button></>:<><a className="appearance-action" href="/?view=account&auth=login">Đăng nhập</a><a className="appearance-action appearance-register" href="/?view=account&auth=register">Đăng ký</a></>}</div></div>{error&&<span className="appearance-error" role="alert">{error}</span>}</div>;
}
