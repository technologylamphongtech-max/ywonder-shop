import {randomUUID} from 'crypto';

type Sql={
 $queryRawUnsafe:(query:string,...values:any[])=>Promise<any[]>;
 $executeRawUnsafe:(query:string,...values:any[])=>Promise<number>;
};

export async function deleteMarketProduct(tx:Sql,productId:string,actorId:string,isAdmin:boolean){
 const product=(await tx.$queryRawUnsafe('SELECT p.id,p.active,s.userId ownerId,s.status storeStatus FROM MarketProduct p LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=?',productId))[0];
 if(!product||Number(product.active)===-1)throw new Error('Sản phẩm không còn tồn tại');
 if(!isAdmin&&(product.ownerId!==actorId||product.storeStatus!=='APPROVED'))throw new Error('Bạn không có quyền xóa sản phẩm này');
 const changed=await tx.$executeRawUnsafe('UPDATE MarketProduct SET active=-1 WHERE id=? AND active<>-1',productId);
 if(changed!==1)throw new Error('Sản phẩm vừa được cập nhật, vui lòng tải lại');
 await tx.$executeRawUnsafe('DELETE FROM MarketFavorite WHERE productId=?',productId);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'product:deleted',productId,Date.now());
}
