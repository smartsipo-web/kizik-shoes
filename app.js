const KIZIK_API_BASE='https://dgkigykovxuvdveldcvv.supabase.co/functions/v1';
const KIZIK_CATALOG_API=KIZIK_API_BASE+'/kizik-catalog';
const KIZIK_SUBMIT_API=KIZIK_API_BASE+'/kizik-submit-order';

const PRODUCT_META=[
  ['WFRE2607','assets/products/WFRE2607.jpg'],['WSIE2607','assets/products/WSIE2607.jpg'],['WSIE2606','assets/products/WSIE2606.jpg'],['WSIE2603','assets/products/WSIE2603.jpg'],
  ['MATH2509','assets/products/MATH2509.jpg'],['MSIE2605','assets/products/MSIE2605.jpg'],['MSIE2604','assets/products/MSIE2604.jpg'],['MSIE2602','assets/products/MSIE2602.jpg'],
  ['MMON2504','assets/products/MMON2504.jpg'],['WMON2501','assets/products/WMON2501.png'],['MFRE2610','assets/products/MFRE2610.jpg'],['MFRE2607','assets/products/MFRE2607.jpg'],
  ['MATH2510','assets/products/MATH2510.jpg'],['MATH2608','assets/products/MATH2608.jpg'],['MATH2606','assets/products/IMG_5580.JPG'],['WATH2612','assets/products/WATH2612.jpg'],
  ['WATH2611','assets/products/IMG_5582.JPG'],['WMON2603','assets/products/IMG_5583.JPG'],['WSIE2602','assets/products/WSIE2602.jpg'],['WSIE2609','assets/products/WSIE2609.jpg'],
  ['BATH2502','assets/products/BATH2502.jpg'],['LATH2502','assets/products/LATH2502.jpg']
];
const IMAGE_MAP=Object.fromEntries(PRODUCT_META);
const ORDER_MAP=new Map(PRODUCT_META.map((x,i)=>[x[0],i]));

let products=[];
let inventory={};
let groups=[];
let generalActivity='目前無特別活動。';
let sourceKey=new URLSearchParams(location.search).get('source')||'general';
let sourceGroup=null;
let discountRate=1;
let cat='all';
let seriesFilter='all';
let cart=JSON.parse(localStorage.getItem('kizik_cart')||'[]');

const genderName=(sku)=>sku.startsWith('M')?'男鞋':sku.startsWith('W')?'女鞋':'兒童鞋';
const seriesName=(s)=>String(s).endsWith('ATH')?'雅典娜2.0系列':String(s).endsWith('FRE')?'跑鞋系列':String(s).endsWith('MON')?'摩納哥系列':String(s).endsWith('SIE')?'西恩納系列':s+' 系列';
const cmTxt=(s)=>s.cm==null?`US ${s.us}｜CM 資料待補`:`US ${s.us}｜${s.cm} cm`;
const money=n=>'$'+Number(n||0).toLocaleString('zh-TW');
const salePrice=base=>Math.round(Number(base)*discountRate);
const discountText=rate=>{
  const z=Math.round(Number(rate)*100)/10;
  return Number.isInteger(z)?`${z} 折`:`${z.toFixed(1)} 折`;
};
function sizeSort(a,b){
  const av=String(a),bv=String(b); const an=parseFloat(av),bn=parseFloat(bv);
  if(!Number.isNaN(an)&&!Number.isNaN(bn)) return an-bn;
  return av.localeCompare(bv,'en',{numeric:true});
}
function rangeText(vs){
  if(!vs?.length)return '';
  const sizes=vs.map(v=>String(v.size)).sort(sizeSort);
  return sizes.length===1?sizes[0]:`${sizes[0]}–${sizes[sizes.length-1]}`;
}

async function syncCatalog(){
  const r=await fetch(KIZIK_CATALOG_API,{cache:'no-store'});
  const d=await r.json();
  if(!r.ok||!d.success)throw new Error(d.error||'catalog_failed');
  groups=d.groups||[];
  generalActivity=d.general_activity||'目前無特別活動。';
  const grouped={};
  for(const v of (d.variants||[]))(grouped[v.sku] ||= []).push(v);
  products=(d.products||[]).map(p=>{
    const vs=(grouped[p.sku]||[]).sort((a,b)=>sizeSort(a.size,b.size));
    inventory[p.sku]=Object.fromEntries(vs.map(v=>[String(v.size),Number(v.stock_qty)]));
    return {
      sku:p.sku,name:p.product_name||p.sku,price:Number(p.price),category:p.category,series:p.series,
      image:IMAGE_MAP[p.sku]||`assets/products/${p.sku}.jpg`,range:rangeText(vs),
      sizes:vs.map(v=>({us:String(v.size),cm:v.cm==null?null:Number(v.cm)}))
    };
  }).sort((a,b)=>(ORDER_MAP.get(a.sku)??999)-(ORDER_MAP.get(b.sku)??999));
  resolveSource();
}

function resolveSource(){
  sourceGroup=null;discountRate=1;
  if(sourceKey!=='general'){
    const g=groups.find(x=>x.group_key===sourceKey && x.active!==false);
    const ended=g?.ends_at && new Date(g.ends_at).getTime()<Date.now();
    if(g&&!ended){sourceGroup=g;discountRate=Number(g.discount_rate)||1;}
    else{sourceKey='general';}
  }
  renderActivity();
  normalizeCartPrices();
}
function renderActivity(){
  const title=document.querySelector('#activityTitle'),note=document.querySelector('#activityNote'),badge=document.querySelector('#activityDiscount');
  const bar=document.querySelector('#sourceBar'),srcTitle=document.querySelector('#sourceTitle'),hint=document.querySelector('#sourceHint');
  if(sourceGroup){
    title.textContent=sourceGroup.name;note.textContent=sourceGroup.note||'團購活動進行中。';badge.hidden=false;badge.textContent=discountText(sourceGroup.discount_rate);
    bar.classList.add('group');srcTitle.textContent=`團購入口｜${sourceGroup.name}`;hint.textContent=sourceGroup.ends_at?`截止：${new Date(sourceGroup.ends_at).toLocaleString('zh-TW')}`:'此訂單會記錄團購來源';
  }else{
    title.textContent='目前活動';note.textContent=generalActivity||'目前無特別活動。';badge.hidden=true;badge.textContent='';bar.classList.remove('group');srcTitle.textContent='一般客戶訂購';hint.textContent='一般訂購入口';
  }
}
function normalizeCartPrices(){
  cart=cart.map(i=>{const p=products.find(x=>x.sku===i.sku);return p?{...i,price:salePrice(p.price)}:i});save();updateCart();
}

async function init(){
  try{await syncCatalog();}
  catch(err){console.error(err);document.querySelector('#grid').innerHTML='<div class="empty">商品資料暫時無法載入，請稍後重新整理。</div>';return;}
  render();updateCart();
}
function render(){
  const list=products.filter(p=>(cat==='all'||p.category===cat)&&(seriesFilter==='all'||p.series.endsWith(seriesFilter)));
  const g=document.querySelector('#grid');g.innerHTML=list.length?'':'<div class="empty">此分類目前尚未上架商品</div>';
  document.querySelector('#productCount').textContent=`共 ${list.length} 款商品`;
  for(const p of list){
    const displayPrice=salePrice(p.price);
    const priceHtml=discountRate<1?`<del>${money(p.price)}</del>${money(displayPrice)}<span class="discountTag">${discountText(discountRate)}</span>`:money(p.price);
    const d=document.createElement('div');d.className='card';
    d.innerHTML=`<div class="photo"><img src="${p.image}" alt="${p.sku}" loading="lazy"></div><div class="body"><div class="seriesBadge">${seriesName(p.series)}</div><div class="sku">${p.sku}</div><div class="small">${genderName(p.sku)}｜US ${p.range}</div><div class="price">${priceHtml}</div><select class="select"><option value="">選擇尺寸</option>${p.sizes.map(s=>{const q=inventory[p.sku]?.[String(s.us)]??0;return `<option value="${s.us}" ${q<=0?'disabled':''}>${cmTxt(s)}${q<=0?'｜售完':''}</option>`}).join('')}</select><div class="cm">選尺寸後顯示對應公分數</div><div class="row"><input class="qty" type="number" min="1" value="1"><button class="add">加入訂單</button></div></div>`;
    const sel=d.querySelector('.select'),cm=d.querySelector('.cm'),qty=d.querySelector('.qty'),addBtn=d.querySelector('.add');
    sel.onchange=()=>{const s=p.sizes.find(x=>String(x.us)===sel.value);cm.textContent=s?cmTxt(s):'選尺寸後顯示對應公分數'};
    addBtn.onclick=()=>{if(!sel.value)return alert('請先選擇尺寸');add(p,sel.value,Math.max(1,Number(qty.value)||1));};
    g.appendChild(d);
  }
}
function setCat(c,b){cat=c;seriesFilter='all';document.querySelectorAll('.navlinks button').forEach(x=>x.classList.remove('on'));b.classList.add('on');render()}
function setSeries(s,b){seriesFilter=s;cat='all';document.querySelectorAll('.navlinks button').forEach(x=>x.classList.remove('on'));b.classList.add('on');render()}
function add(p,size,qty){
  const available=Number(inventory[p.sku]?.[String(size)]||0),key=p.sku+'-'+size,existing=cart.find(i=>i.key===key),current=existing?.qty||0;
  if(available<=0)return alert('這個尺寸目前已售完');
  if(current+qty>available)return alert(`此尺寸目前最多可加入 ${available} 雙`);
  if(existing)existing.qty+=qty;else{const s=p.sizes.find(s=>String(s.us)===String(size));cart.push({key,sku:p.sku,price:salePrice(p.price),size,cm:s?.cm,qty});}
  save();updateCart();
}
function save(){localStorage.setItem('kizik_cart',JSON.stringify(cart))}
function updateCart(){
  const count=cart.reduce((a,b)=>a+Number(b.qty||0),0);document.querySelector('#cartCount').textContent=count;
  const box=document.querySelector('#cartItems');if(!box)return;box.innerHTML=cart.length?'':'<div class="empty" style="padding:24px">購物車目前是空的</div>';
  cart.forEach((i,idx)=>{const d=document.createElement('div');d.className='cartItem';d.innerHTML=`<div><b>${i.sku}</b><div class="small">US ${i.size}${i.cm?'｜'+i.cm+' cm':''} × ${i.qty}</div></div><div>${money(i.price*i.qty)} <button onclick="removeItem(${idx})">×</button></div>`;box.appendChild(d)});
  document.querySelector('#total').textContent=money(cart.reduce((a,b)=>a+b.price*b.qty,0));
}
function removeItem(i){cart.splice(i,1);save();updateCart()}
function openCart(){document.querySelector('#cartModal').classList.add('open');updateCart()}
function closeCart(e){if(!e||e.target?.id==='cartModal')document.querySelector('#cartModal').classList.remove('open')}
async function checkout(){
  if(!cart.length)return alert('購物車目前是空的');
  const customerName=document.querySelector('#customerName')?.value.trim()||'',name=document.querySelector('#name')?.value.trim()||'',phone=document.querySelector('#phone')?.value.trim()||'',address=document.querySelector('#address')?.value.trim()||'',note=document.querySelector('#note')?.value.trim()||'';
  if(!customerName&&!(name&&phone))return alert('請填「客戶名稱」，或填寫「姓名＋電話」，二選一即可');
  const btn=document.querySelector('.checkout');btn.disabled=true;btn.textContent='訂單送出中…';
  try{
    const payload={customer_name:customerName,contact_name:name,phone,address,note,source_key:sourceKey,items:cart.map(i=>({sku:i.sku,size:String(i.size),qty:Number(i.qty)}))};
    const r=await fetch(KIZIK_SUBMIT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json();
    if(!r.ok||!d.success){const msg=String(d.error||'');if(msg.startsWith('insufficient_stock:'))throw new Error('部分尺寸庫存不足，請重新選擇');if(msg==='group_ended')throw new Error('此團購活動已截止，請改用一般訂購入口');throw new Error(d.error||'訂單送出失敗');}
    cart=[];save();updateCart();await syncCatalog();render();
    alert(`訂單已送出！\n訂單編號：${d.order_no}${d.source_name&&d.source_name!=='一般客戶'?`\n團購：${d.source_name}`:''}`);closeCart();
  }catch(err){alert(err?.message||'訂單送出失敗，請稍後再試');}
  finally{btn.disabled=false;btn.textContent='送出訂單';}
}
init();
