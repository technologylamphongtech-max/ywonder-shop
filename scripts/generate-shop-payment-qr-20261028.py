"""Create an account-only Nam A VietQR fallback, without an external service."""
import cv2
from pathlib import Path

def tlv(tag,value):
    return f'{tag}{len(value):02d}{value}'

def crc16(data):
    crc=0xffff
    for byte in data.encode('ascii'):
        crc^=byte<<8
        for _ in range(8):
            crc=((crc<<1)^0x1021)&0xffff if crc&0x8000 else (crc<<1)&0xffff
    return f'{crc:04X}'

bank='970428'
account='702252070200001'
merchant=tlv('00','A000000727')+tlv('01',tlv('00',bank)+tlv('01',account))+tlv('02','QRIBFTTA')
body=tlv('00','01')+tlv('01','11')+tlv('38',merchant)+tlv('52','6011')+tlv('53','704')+tlv('58','VN')+tlv('59','NAB')+tlv('60','Hanoi')+'6304'
payload=body+crc16(body)
image=cv2.QRCodeEncoder_create().encode(payload)
image=cv2.copyMakeBorder(image,4,4,4,4,cv2.BORDER_CONSTANT,value=255)
image=cv2.resize(image,None,fx=8,fy=8,interpolation=cv2.INTER_NEAREST)
decoded,_,_=cv2.QRCodeDetector().detectAndDecode(image)
assert decoded==payload and bank in decoded and account in decoded,'Generated QR did not decode to the new bank account'
target=Path(__file__).resolve().parents[1]/'public/assets/shop-nam-a-702252070200001-qr.png'
target.parent.mkdir(parents=True,exist_ok=True)
assert cv2.imwrite(str(target),image)
print('Local Nam A account-only VietQR generated and decoded')
