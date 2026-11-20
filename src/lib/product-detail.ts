export const PHONG_CHAU_COMBO_PRODUCT_ID='6b51090b-767b-4fc7-89e4-83fa5704c454';

export const PRODUCT_SPEC_FIELDS = [
 {key:'model',label:'Mẫu / Model'},
 {key:'barcode',label:'Mã vạch / GTIN'},
 {key:'material',label:'Chất liệu'},
 {key:'color',label:'Màu sắc'},
 {key:'size',label:'Kích cỡ / Quy cách'},
 {key:'weight',label:'Khối lượng sản phẩm (g)'},
 {key:'dimensions',label:'Kích thước (D × R × C, cm)'},
 {key:'packageContents',label:'Bộ sản phẩm gồm'},
 {key:'usage',label:'Hướng dẫn sử dụng'},
 {key:'storage',label:'Hướng dẫn bảo quản'},
] as const;

export function productImages(product:{image?:string;imagesJson?:string}):string[]{
 let list:string[]=[];
 try {const parsed=JSON.parse(product.imagesJson||'[]');if(Array.isArray(parsed))list=parsed.filter((item):item is string=>typeof item==='string'&&!!item).slice(0,4)}catch{}
 return list.length?list:product.image?[product.image]:[];
}

export function productSpecs(product:{specsJson?:string}):Record<string,string>{
 try {const value=JSON.parse(product.specsJson||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
}
