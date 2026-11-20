'use client';
import {useEffect} from 'react';

export default function StoreReferralReset(){
 useEffect(()=>{
  sessionStorage.removeItem('yw-phongchau-shop-ref');
  sessionStorage.removeItem('yw-phongchau-product-ref');
 },[]);
 return null;
}
