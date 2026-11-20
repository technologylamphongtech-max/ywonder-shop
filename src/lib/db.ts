import {PrismaClient} from '@prisma/client';
const g=globalThis as unknown as {marketDb:PrismaClient};
export const db=g.marketDb || new PrismaClient();
if(process.env.NODE_ENV!=='production')g.marketDb=db;
export const normalize=(v:any):any=>typeof v==='bigint'?Number(v):Array.isArray(v)?v.map(normalize):v&&typeof v==='object'&&!(v instanceof Date)?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)])):v;
export const rows=async(sql:string,...args:any[]):Promise<any[]>=>normalize(await db.$queryRawUnsafe(sql,...args));
export const run=async(sql:string,...args:any[])=>db.$executeRawUnsafe(sql,...args);
export const transaction=async(fn:(tx:any)=>Promise<any>,options?:any)=>db.$transaction(async(tx:any)=>fn({user:tx.user,$executeRawUnsafe:tx.$executeRawUnsafe.bind(tx),$queryRawUnsafe:async(...args:any[])=>normalize(await tx.$queryRawUnsafe(...args))}),options);
