'use client';
import {useEffect,useMemo,useState} from 'react';

type Ward={code:string;name:string;type?:string;postalCode?:string};
type Province={code:string;name:string;wards:Ward[]};
type AddressProfile=Record<string,any>;

export default function AddressFields({profile={},required=false}:{profile?:AddressProfile;required?:boolean}){
 const [provinces,setProvinces]=useState<Province[]>([]);
 const [street,setStreet]=useState(String(profile.street||''));
 const [provinceCode,setProvinceCode]=useState(String(profile.provinceCode||''));
 const [wardCode,setWardCode]=useState(String(profile.wardCode||''));
 const [zipCode,setZipCode]=useState(String(profile.zipCode||''));
 const [addressDetail,setAddressDetail]=useState(String(profile.addressDetail||profile.address||''));
 useEffect(()=>{let active=true;fetch('/data/vietnam-administrative-2025.json',{cache:'force-cache'}).then(r=>r.ok?r.json():Promise.reject(new Error('Không tải được dữ liệu địa chỉ'))).then(d=>{if(active)setProvinces(d.provinces||[])}).catch(()=>{if(active)setProvinces([])});return()=>{active=false}},[]);
 const province=useMemo(()=>provinces.find(p=>p.code===provinceCode),[provinces,provinceCode]);
 const wards=province?.wards||[];
 const ward=wards.find(w=>w.code===wardCode);
 useEffect(()=>{if(ward?.postalCode&&!zipCode)setZipCode(ward.postalCode)},[ward?.code]);
 const address=[addressDetail.trim(),street.trim(),ward?.name||profile.wardName||'',province?.name||profile.provinceName||'',zipCode.trim()?`ZIP ${zipCode.trim()}`:''].filter(Boolean).join(', ');
 return <div className="address-fields">
  <div className="form-grid">
   <label className="field"><span>Đường phố</span><input name="street" value={street} onChange={e=>setStreet(e.target.value)} placeholder="Tên đường" required={required}/></label>
   <label className="field"><span>Tỉnh / thành phố (sau sáp nhập)</span><select name="provinceCode" value={provinceCode} onChange={e=>{setProvinceCode(e.target.value);setWardCode('');setZipCode('')}} required={required}><option value="">Chọn tỉnh / thành phố</option>{provinces.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select><input type="hidden" name="provinceName" value={province?.name||profile.provinceName||''}/></label>
  </div>
  <div className="form-grid">
   <label className="field"><span>Xã / phường (sau sáp nhập)</span><select name="wardCode" value={wardCode} onChange={e=>{const code=e.target.value;setWardCode(code);setZipCode(wards.find(w=>w.code===code)?.postalCode||'')}} disabled={!provinceCode||!wards.length} required={required}><option value="">{provinceCode?'Chọn xã / phường':'Chọn tỉnh trước'}</option>{wards.map(w=><option key={w.code} value={w.code}>{w.name}</option>)}</select><input type="hidden" name="wardName" value={ward?.name||profile.wardName||''}/></label>
   <label className="field"><span>ZIP code (tự động)</span><input name="zipCode" value={zipCode} readOnly inputMode="numeric" maxLength={5} placeholder="Chọn xã / phường để tự điền" required={required}/></label>
  </div>
  <label className="field"><span>Địa chỉ cụ thể</span><textarea name="addressDetail" value={addressDetail} onChange={e=>setAddressDetail(e.target.value)} rows={3} placeholder="Số nhà, căn hộ, tầng, tòa nhà, ngõ/hẻm..." required={required}/></label>
  <input type="hidden" name="address" value={address}/>
 </div>;
}
