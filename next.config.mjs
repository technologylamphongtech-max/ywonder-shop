export default {reactStrictMode:true, poweredByHeader:false, experimental:{cpus:1}, async redirects(){return [
 {source:'/index.html',destination:'/',permanent:false},
 {source:'/danh-muc.html',destination:'/?view=shop',permanent:false},
 {source:'/doanh-nghiep.html',destination:'/?view=business',permanent:false},
 {source:'/ca-nhan.html',destination:'/?view=account',permanent:false},
 {source:'/login',destination:'/?view=account',permanent:false}
]}};
