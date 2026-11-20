import {NextRequest,NextResponse} from 'next/server';
import {issueVietQrToken,validVietQrBasic} from '../../../../lib/vietqr-merchant';

export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
 if(!validVietQrBasic(req.headers.get('authorization')))return NextResponse.json({status:'FAILED',message:'INVALID_CREDENTIALS'},{status:401,headers:{'Cache-Control':'no-store'}});
 return NextResponse.json(issueVietQrToken(),{headers:{'Cache-Control':'no-store'}});
}
