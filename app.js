import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,setDoc,deleteDoc,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const names={'cathay-bank':'國泰世華銀行','cathay-sec':'國泰證券','yuanta-sec':'元大證券','firstrade-stock':'Firstrade 股票','firstrade-cash':'Firstrade 現金'};
const fmt=(n,c='TWD')=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:c,maximumFractionDigits:c==='TWD'?0:2}).format(Number(n)||0);
const safe=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let auth,db,user,items=[],rate=32,unsubAssets,unsubSettings,pending=[];
const installed = Object.values(firebaseConfig).every(v=>v && !String(v).includes('REPLACE_ME'));
if(!installed){$('setup').hidden=false;}else{
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 $('loginBtn').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){if(e.code==='auth/popup-blocked')await signInWithRedirect(auth,new GoogleAuthProvider());else alert('登入失敗：'+e.message)}};
 onAuthStateChanged(auth,u=>{if(unsubAssets)unsubAssets();if(unsubSettings)unsubSettings();user=u;$('login').hidden=!!u;$('workspace').hidden=!u;$('logout').hidden=!u;if(!u)return;$('identity').textContent='登入帳號：'+(u.email||u.uid);$('myUid').value=u.uid;unsubAssets=onSnapshot(collection(db,'users',u.uid,'assets'),s=>{items=s.docs.map(d=>({...d.data(),id:d.id}));render();scheduleDailyQuotes()},e=>{alert('讀取資料失敗，請檢查 Firestore 規則：'+e.message)});unsubSettings=onSnapshot(doc(db,'users',u.uid,'meta','preferences'),s=>{rate=Number(s.data()?.usdTwd)||32;$('rate').value=rate;render()},e=>console.error(e));});
}
$('logout').onclick=()=>signOut(auth);
$('copyUid').onclick=async()=>{if(!user)return;try{await navigator.clipboard.writeText(user.uid);alert('UID 已複製')}catch(e){$('myUid').select();alert('請從輸入框複製 UID')}};
Object.entries(names).forEach(([key,value])=>$('account').add(new Option(value,key)));
function syncAssetCurrency(){const a=$('account').value,stock=$('kind').value==='stock';if(stock){$('currency').value=a==='firstrade-stock'?'USD':'TWD';$('currencyField').hidden=true;$('currencyHint').textContent='已依帳戶自動設定：'+(a==='firstrade-stock'?'美元（USD）':'新台幣（TWD）')}else{$('currencyField').hidden=false;$('currencyHint').textContent='現金／存款可依實際幣別選擇'}}
$('account').onchange=()=>{const a=$('account').value;$('kind').value=a==='cathay-bank'||a==='firstrade-cash'?'cash':'stock';$('currency').value=a.startsWith('firstrade')?'USD':'TWD';syncAssetCurrency()};
$('account').dispatchEvent(new Event('change'));
$('kind').onchange=()=>{const cash=$('kind').value==='cash';$('symbol').disabled=cash;$('cost').disabled=cash;$('price').disabled=cash;syncAssetCurrency()};$('kind').dispatchEvent(new Event('change'));
for(const b of document.querySelectorAll('#tabs button'))b.onclick=()=>{document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('selected',x===b));document.querySelectorAll('.tab').forEach(t=>t.hidden=t.id!==b.dataset.tab)};

const stockNameCache={TWD:new Map(),USD:new Map()};
let lookupSequence=0;
async function loadStockNames(currency){
 const type=currency==='USD'?'us':'twse',map=stockNameCache[currency];
 if(map.size)return map;
 const response=await fetch('./quotes/'+type+'.json',{cache:'no-store'});
 if(!response.ok)throw Error('公開名稱資料尚未更新');
 const data=await response.json();
 for(const [symbol,name] of Object.entries(data.names||{}))if(typeof name==='string'&&name.trim())map.set(symbol.toUpperCase(),name.trim());
 return map;
}
async function lookupStockName(){
 const sym=$('symbol').value.trim().toUpperCase(),currency=$('currency').value,serial=++lookupSequence;
 if($('kind').value!=='stock'||!sym){$('nameStatus').textContent='';return}
 $('nameStatus').textContent='查詢股票名稱…';
 try{
 const map=await loadStockNames(currency);
 if(serial!==lookupSequence||sym!==$('symbol').value.trim().toUpperCase())return;
 const name=map.get(sym);
 if(name){$('assetName').value=name;$('nameStatus').textContent='已帶入：'+name}
 else $('nameStatus').textContent='查無名稱，可自行輸入（美股目前限公開行情清單；台股目前限上市）';
 }catch(err){if(serial===lookupSequence)$('nameStatus').textContent='暫時無法取得名稱，可手動輸入：'+err.message}
}
$('symbol').addEventListener('change',lookupStockName);
$('symbol').addEventListener('blur',lookupStockName);
$('currency').addEventListener('change',lookupStockName);

const value=i=>Number(i.quantity||0)*(i.kind==='cash'?1:Number(i.price||0));
const twd=i=>value(i)*(i.currency==='USD'?rate:1);
function render(){if(!user)return;const total=items.reduce((s,i)=>s+twd(i),0),cash=items.filter(i=>i.kind==='cash').reduce((s,i)=>s+twd(i),0),stock=total-cash,pnl=items.filter(i=>i.kind==='stock').reduce((s,i)=>s+(Number(i.price||0)-Number(i.cost||0))*Number(i.quantity||0)*(i.currency==='USD'?rate:1),0);$('total').textContent=fmt(total);$('cashTotal').textContent=fmt(cash);$('stockTotal').textContent=fmt(stock);$('pnlTotal').textContent=fmt(pnl);$('pnlTotal').className=pnl<0?'neg':'pos';$('status').textContent=`共 ${items.length} 筆資產 · USD/TWD ${rate} · 依最近儲存價格估算（非即時餘額）`;$('accountCards').innerHTML=Object.entries(names).map(([id,name])=>`<div class="account-card"><small>${safe(name)}</small><strong>${fmt(items.filter(i=>i.account===id).reduce((s,i)=>s+twd(i),0))}</strong><small>${items.filter(i=>i.account===id).length} 筆資產</small></div>`).join('');const holdings=items.filter(i=>i.kind==='stock');$('holdingsOverview').innerHTML=holdings.length?holdings.map(i=>assetHtml(i,false)).join(''):'<div class="panel muted">尚無持股資料。</div>';$('assetList').innerHTML=items.length?items.map(i=>assetHtml(i,true)).join(''):'<div class="panel muted">尚無資產紀錄，請先新增或匯入。</div>';document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('確定刪除這筆資產？此操作不能自動復原。'))return;try{await deleteDoc(doc(db,'users',user.uid,'assets',b.dataset.delete))}catch(e){alert(e.message)}})}
function assetHtml(i,editable){let pnl=i.kind==='stock'?(Number(i.price||0)-Number(i.cost||0))*Number(i.quantity||0):0;return `<div class="asset-item"><div><b>${safe(i.name||i.symbol||'現金')}</b><small>${safe(names[i.account])} · ${safe(i.symbol||i.kind)} · ${safe(i.currency)} · ${Number(i.quantity).toLocaleString('zh-TW')}${i.kind==='stock'?' 股':''}</small></div><div class="right"><b>${fmt(value(i),i.currency)}</b>${i.kind==='stock'?`<small class="${pnl<0?'neg':'pos'}">損益 ${fmt(pnl,i.currency)}</small>`:''}${editable?`<button data-delete="${safe(i.id)}">刪除</button>`:''}</div></div>`}
function normalize(r){const account=String(r.account||'').trim(),kind=String(r.kind||'').trim(),symbol=String(r.symbol||'').trim().toUpperCase(),currency=String(r.currency||'').trim().toUpperCase(),quantity=Number(r.quantity),cost=Number(r.cost||0),price=Number(r.price||0);if(!names[account]||!['cash','stock'].includes(kind)||!['TWD','USD'].includes(currency)||!Number.isFinite(quantity)||quantity<0||!Number.isFinite(cost)||cost<0||!Number.isFinite(price)||price<0)throw Error('欄位格式錯誤');if(kind==='stock'&&!symbol)throw Error('股票代碼不可空白');return {account,kind,symbol:kind==='cash'?'CASH':symbol,name:String(r.name||symbol||'現金').trim(),currency,quantity,cost:kind==='cash'?0:cost,price:kind==='cash'?0:price}}
const key=i=>[i.account,i.kind,i.symbol,i.currency].join('__').replace(/[^a-zA-Z0-9_-]/g,'_');
async function upsert(i){await setDoc(doc(db,'users',user.uid,'assets',key(i)),{...i,updatedAt:serverTimestamp()})}
$('assetForm').onsubmit=async e=>{e.preventDefault();if(!user)return;try{syncAssetCurrency();const item=normalize({account:$('account').value,kind:$('kind').value,symbol:$('symbol').value,name:$('assetName').value,currency:$('currency').value,quantity:$('quantity').value,cost:$('cost').value,price:$('price').value});if(item.kind==='stock'&&(!item.name||item.name===item.symbol)){try{const lookup=await loadStockNames(item.currency);item.name=lookup.get(item.symbol)||item.name}catch(e){/* manual name remains valid */}}await upsert(item);$('saveMsg').textContent='已同步至私人資料庫';$('assetForm').reset();$('account').dispatchEvent(new Event('change'));$('kind').dispatchEvent(new Event('change'))}catch(err){$('saveMsg').textContent='儲存失敗：'+err.message}};
// 僅在資料同步完成後、每台裝置每日最多嘗試一次自動更新。
// 遠端行情失敗時保留原有價格；不更動持股數量與平均成本。
let autoQuoteStarted=false;
async function refreshFx(silent=false){
  try{
    const r=await fetch('https://open.er-api.com/v6/latest/USD',{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json(),v=Number(data?.rates?.TWD);
    if(data?.result!=='success')throw new Error('匯率服務未成功回應');
    const sourceDate=data.time_last_update_utc||'';
    if(!(v>0&&v<100))throw new Error('匯率資料無效');
    const previous=rate;
    if(Math.abs(previous-v)<0.0000001){$('fxStatus').textContent='參考匯率無變動（資料日 '+safe(sourceDate||'未知')+'）';return}
    await setDoc(doc(db,'users',user.uid,'meta','preferences'),{usdTwd:v,fxSource:'ExchangeRate-API',fxDate:sourceDate,updatedAt:serverTimestamp()},{merge:true});
    $('fxStatus').textContent='參考匯率已更新：'+v.toFixed(4)+'（資料日 '+safe(sourceDate||'未知')+'；非銀行成交價）';
  }catch(e){$('fxStatus').textContent='匯率取得失敗，保留原值：'+e.message;if(!silent)console.warn(e)}
}
async function refreshTwse(silent=false){
 const arr=items.filter(i=>i.kind==='stock'&&i.currency==='TWD'&&/^\d{4,6}$/.test(i.symbol));
 if(!arr.length){$('quoteStatus').textContent='沒有符合條件的台股持股。';return}
 $('quoteStatus').textContent='正在查詢證交所盤後資料…';
 try{
   // Same-origin public market data generated by GitHub Actions; avoids TWSE browser CORS.
   const res=await fetch('./quotes/twse.json?v='+Date.now(),{cache:'no-store'});
   if(!res.ok)throw Error(res.status===404?'公開行情尚未產生，需先在 GitHub Actions 執行 Refresh public TWSE quotes':'行情快取 HTTP '+res.status);
   const data=await res.json();
   if(!data?.prices||typeof data.prices!=='object')throw Error('公開行情資料格式錯誤');
   const lookup=new Map(Object.entries(data.prices).map(([code,price])=>[code,{ClosingPrice:price}]));
   const fetchedAt=data.fetchedAt ? new Date(data.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}) : '未知';
   let updated=0;
   for(const i of arr){
     const x=lookup.get(i.symbol);if(!x)continue;
     const v=Number(String(x.ClosingPrice||x['收盤價']||'').replace(/,/g,''));
     if(v>0&&Number.isFinite(v)&&v!==Number(i.price)){
       const {id,updatedAt,...fields}=i;
       await upsert({...fields,price:v});updated++;
     }
   }
   $('quoteStatus').textContent='公開行情更新時間：'+fetchedAt+'；已更新 '+updated+' 筆，匹配 '+arr.filter(i=>lookup.has(i.symbol)).length+' / '+arr.length+' 筆上市台股。';
 }catch(e){$('quoteStatus').textContent='行情取得失敗，保留既有股價：'+e.message;if(!silent)console.warn(e)}
}
async function refreshUs(silent=false){
 const arr=items.filter(i=>i.kind==='stock'&&i.currency==='USD');
 if(!arr.length){$('usQuoteStatus').textContent='目前沒有美股或 ETF 持股。';return}
 $('usQuoteStatus').textContent='讀取美股公開收盤價中…';
 try{
   const res=await fetch('./quotes/us.json?t='+Date.now(),{cache:'no-store'});
   if(!res.ok)throw Error(res.status===404?'尚未產生美股行情檔，請確認 GitHub Actions 首次執行成功':'行情快取 HTTP '+res.status);
   const data=await res.json();
   if(!data?.prices||!data?.dates)throw Error('美股行情資料格式不符');
   let updated=0, matched=0;const missing=[];
   for(const i of arr){
     const sym=String(i.symbol).toUpperCase();
     const price=Number(data.prices[sym]);
     if(!(price>0)){missing.push(sym);continue}
     matched++;
     if(price!==Number(i.price)){
       const {id,updatedAt,...fields}=i;
       await upsert({...fields,price});updated++;
     }
   }
   const newest=Object.values(data.dates).sort().at(-1)||'未知';
   $('usQuoteStatus').textContent='資料最新交易日 '+newest+'；已更新 '+updated+' 筆，匹配 '+matched+' / '+arr.length+' 筆。'+(missing.length?' 未涵蓋：'+missing.slice(0,8).join(', '):'')+'。報價僅供資產估值，不代表即時成交價。';
 }catch(e){$('usQuoteStatus').textContent='美股行情更新失敗，原價格未變：'+e.message;if(!silent)console.warn(e)}
}
function scheduleDailyQuotes(){
 if(autoQuoteStarted||!user)return;
 autoQuoteStarted=true;
 const key='mw_quotes_day_'+user.uid;
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
 if(localStorage.getItem(key)===day)return;
 setTimeout(async()=>{if(!user)return;await refreshFx(true);if(items.length){await refreshTwse(true);await refreshUs(true)}localStorage.setItem(key,day)},1000);
}
$('saveRate').onclick=async()=>{const r=Number($('rate').value);if(!user||!(r>0))return alert('請填入正確匯率');try{await setDoc(doc(db,'users',user.uid,'meta','preferences'),{usdTwd:r,updatedAt:serverTimestamp()},{merge:true})}catch(e){alert(e.message)}};
function parseCSV(text){const rows=[];let row=[],field='',quoted=false;for(let j=0;j<text.length;j++){const ch=text[j];if(ch==='"'&&quoted&&text[j+1]==='"'){field+='"';j++}else if(ch==='"')quoted=!quoted;else if(ch===','&&!quoted){row.push(field);field=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[j+1]==='\n')j++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=ch}row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(quoted)throw Error('CSV 引號格式不完整');const headers=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim());for(const h of ['account','kind','symbol','name','currency','quantity','cost','price'])if(!headers.includes(h))throw Error('缺少欄位：'+h);return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
$('csv').onchange=async e=>{pending=[];$('import').hidden=true;const f=e.target.files[0];if(!f)return;try{const rows=parseCSV(await f.text());if(rows.length>500)throw Error('單次最多 500 筆');pending=rows.map(normalize);const unique=new Set(pending.map(key));if(unique.size!==pending.length)throw Error('檔案中有重複帳戶／股票代碼，請先整理');$('preview').innerHTML=`<p>共 ${pending.length} 筆，將依帳戶與代碼新增或取代現有相同資產。</p><div style="overflow:auto"><table><tr><th>帳戶</th><th>代碼</th><th>數量／餘額</th><th>幣別</th></tr>${pending.slice(0,30).map(x=>`<tr><td>${safe(names[x.account])}</td><td>${safe(x.symbol)}</td><td>${x.quantity}</td><td>${x.currency}</td></tr>`).join('')}</table></div>`;$('import').hidden=!pending.length}catch(e){$('preview').textContent='匯入無法解析：'+e.message}};
$('import').onclick=async()=>{if(!user||!pending.length||!confirm(`確認新增／更新 ${pending.length} 筆資產？`))return;try{for(const x of pending)await upsert(x);$('preview').textContent=`已儲存 ${pending.length} 筆。`;pending=[];$('import').hidden=true}catch(e){alert('部分匯入失敗，請核對：'+e.message)}};
function download(name,data,mime){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type:mime}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('template').onclick=()=>download('my-wealth-template.csv','account,kind,symbol,name,currency,quantity,cost,price\n','text/csv;charset=utf-8');
$('export').onclick=()=>download('my-wealth-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),usdTwd:rate,assets:items.map(({updatedAt,...i})=>i)},null,2),'application/json');
$('twse').onclick=()=>refreshTwse();
$('refreshFx').onclick=()=>refreshFx();

$('usQuote').onclick=()=>refreshUs();


let ftPending=[];
function ftParse(text){
 const rows=[];let row=[],field='',q=false;const raw=text.replace(/^\uFEFF/,'');
 for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'&&q&&raw[i+1]==='"'){field+='"';i++}else if(c==='"')q=!q;else if(c===','&&!q){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field=''}else field+=c}
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);if(q)throw Error('CSV 引號格式錯誤');
 const norm=x=>String(x||'').toLowerCase().replace(/[\s_()]+/g,' ').trim();
 const aliases={symbol:['symbol','ticker','stock symbol','security symbol'],quantity:['quantity','shares','qty','shares held'],cost:['average cost','avg cost','average price','avg price','cost basis per share'],name:['description','security description','name'],price:['last price','market price','price']};
 let header=-1,mapping={};
 for(let n=0;n<Math.min(25,rows.length);n++){const hdr=rows[n].map(norm),found={};for(const [k,terms] of Object.entries(aliases)){const p=hdr.findIndex(x=>terms.includes(x));if(p>=0)found[k]=p}if(found.symbol!==undefined&&found.quantity!==undefined&&found.cost!==undefined){header=n;mapping=found;break}}
 if(header<0)throw Error('找不到 Symbol / Quantity / Average Cost 欄位，可能不是持股庫存 CSV。請提供去識別化欄位標題協助對應。');
 const result=[],seen=new Set();
 const number=x=>Number(String(x??'').replace(/[$,\s]/g,''));
 for(const r of rows.slice(header+1)){const symbol=String(r[mapping.symbol]||'').trim().toUpperCase().replace(/\./g,'-');
 if(!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)||symbol==='CASH'||symbol==='TOTAL')continue;
 const quantity=number(r[mapping.quantity]),cost=number(r[mapping.cost]);
 if(!(quantity>0))continue;
 if(!String(r[mapping.cost]||'').trim()||!(cost>=0&&Number.isFinite(cost)))throw Error(symbol+' 平均成本缺漏或無效');
 const rawPrice=mapping.price===undefined?'':r[mapping.price],price=String(rawPrice||'').trim()?number(rawPrice):0;
 if(!(price>=0&&Number.isFinite(price)))throw Error(symbol+' 現價無效');
 if(seen.has(symbol))throw Error('代碼重複：'+symbol);
 seen.add(symbol);
 result.push(normalize({account:'firstrade-stock',kind:'stock',symbol,name:mapping.name===undefined?symbol:r[mapping.name]||symbol,currency:'USD',quantity,cost,price}));
 }
 if(!result.length||result.length>300)throw Error('有效持股數量不在 1–300 筆範圍');
 return result;
}
$('firstradeFile').onchange=async e=>{
 ftPending=[];$('firstradeImport').hidden=true;
 const f=e.target.files?.[0];if(!f)return;
 try{
 if(f.size>2000000)throw Error('檔案不得超過 2 MB');
 const parsed=ftParse(await f.text()),exists=new Set(items.map(key));
 ftPending=parsed.filter(i=>!exists.has(key(i)));
 $('firstradePreview').innerHTML='<p>共辨識 '+parsed.length+' 筆，新增 '+ftPending.length+' 筆，略過既有 '+(parsed.length-ftPending.length)+' 筆。</p><div style="overflow:auto"><table><tr><th>股票</th><th>股數</th><th>每股成本 USD</th><th>處理</th></tr>'+parsed.slice(0,35).map(i=>'<tr><td>'+safe(i.symbol)+'</td><td>'+i.quantity+'</td><td>'+i.cost+'</td><td>'+(exists.has(key(i))?'略過':'新增')+'</td></tr>').join('')+'</table></div>';
 $('firstradeImport').hidden=!ftPending.length;
 }catch(err){$('firstradePreview').textContent='匯入預覽失敗：'+err.message}
};
$('firstradeImport').onclick=async()=>{
 if(!user||!ftPending.length)return;
 const fresh=ftPending.filter(i=>!items.some(v=>key(v)===key(i)));
 if(!fresh.length){$('firstradePreview').textContent='沒有新股票可匯入';$('firstradeImport').hidden=true;return}
 if(!confirm('只新增 '+fresh.length+' 筆股票，既有持股不覆蓋。確認匯入？'))return;
 download('my-wealth-before-firstrade-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),usdTwd:rate,assets:items.map(({updatedAt,...i})=>i)},null,2),'application/json');
 try{let created=0,skipped=0;for(const i of fresh){const wasCreated=await runTransaction(db,async tx=>{const ref=doc(db,'users',user.uid,'assets',key(i));const current=await tx.get(ref);if(current.exists())return false;tx.set(ref,{...i,updatedAt:serverTimestamp()});return true});if(wasCreated)created++;else skipped++;}
 $('firstradePreview').textContent='已新增 '+created+' 筆，跳過已存在 '+skipped+' 筆；請核對持股。匯入前資料備份已下載。';ftPending=[];$('firstradeImport').hidden=true;$('firstradeFile').value='';
 }catch(err){$('firstradePreview').textContent='部分資料可能已匯入，請核對：'+err.message}
};


let shotRows=[],shotGeometry=[];
async function shotCellOCR(worker, canvas, x0, y0, x1, y1){
 const out=document.createElement('canvas');
 out.width=Math.max(1,Math.round((x1-x0)*2));out.height=Math.max(1,Math.round((y1-y0)*2));
 const ctx=out.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
 ctx.drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,out.width,out.height);
 const r=await worker.recognize(out);
 return (r.data.text||'').trim();
}
async function shotExtract(worker,file){
 const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();
 const px=ctx.getImageData(0,0,width,height).data, candidates=[];
 // Firstrade holdings screenshot uses near-horizontal gray separators across row width.
 for(let y=Math.floor(height*.22);y<Math.floor(height*.88);y+=1){
   let matches=0,count=0;
   for(let x=Math.floor(width*.33);x<Math.floor(width*.92);x+=9){
     const k=(y*width+x)*4,r=px[k],g=px[k+1],b=px[k+2];
     if(Math.max(r,g,b)-Math.min(r,g,b)<13&&r>=185&&r<=232)matches++;
     count++;
   }
   if(matches/count>.55)candidates.push(y);
 }
 const separators=[];
 for(const y of candidates)if(!separators.length||y-separators[separators.length-1]>12)separators.push(y);
 // Infer missing separator positions from nearby row spacing, but never invent holdings.
 // Only actual OCR text plus unit-cost arithmetic can produce an import candidate.
 const steps=separators.slice(1).map((v,i)=>v-separators[i]).filter(v=>v>height*.055&&v<height*.15);
 const typical=steps.length?steps.sort((a,b)=>a-b)[Math.floor(steps.length/2)]:height*.09;
 const boundaries=[];
 for(let i=0;i<separators.length;i++){
   if(!boundaries.length)boundaries.push(separators[i]);
   else{
     const prev=boundaries[boundaries.length-1],gap=separators[i]-prev;
     const n=Math.round(gap/typical);
     if(n>=2&&n<=5&&Math.abs(gap/n-typical)<typical*.28)
       for(let k=1;k<n;k++)boundaries.push(Math.round(prev+gap*k/n));
     boundaries.push(separators[i]);
   }
 }
 const rows=[],diagnostics=[];
 for(let i=0;i<boundaries.length-1&&rows.length<25;i++){
   const top=boundaries[i],bottom=boundaries[i+1];
   if(bottom-top<height*.055||bottom-top>height*.16)continue;
   const [left,unit,total]=await Promise.all([
     shotCellOCR(worker,canvas,width*.16,top+5,width*.49,bottom-4),
     shotCellOCR(worker,canvas,width*.49,top+5,width*.755,bottom-4),
     shotCellOCR(worker,canvas,width*.755,top+5,width*.99,bottom-4)
   ]);
   const sym=(left.match(/\b(?:AMD|AVGO|GOOG|GOOGL|LITE|QQQ|[A-Z]{2,5})\b/i)||[])[0]?.toUpperCase()||'';
   // Display uncertain cells for correction rather than discarding the whole row.
   const qtyMatch=left.match(/\d+(?:,\d{3})*(?:\.\d{1,8})?/g)||[];
   const monetary=t=>{const m=String(t).replace(/\s/g,'').match(/\$?([\d,]+(?:\.\d+)?)/);return m?Number(m[1].replace(/,/g,'')):null};
   const qty=qtyMatch.length?Number(qtyMatch[qtyMatch.length-1].replace(/,/g,'')):null, cost=monetary(unit),sum=monetary(total);
   diagnostics.push('列 '+(i+1)+' 左['+left.replace(/\s+/g,' ')+'] 中['+unit.replace(/\s+/g,' ')+'] 右['+total.replace(/\s+/g,' ')+']');
   if(!sym&&!Number.isFinite(qty)&&!Number.isFinite(cost)&&!Number.isFinite(sum))continue;
   const valid=!!sym&&qty>0&&cost>0&&sum>0&&Math.abs(qty*cost-sum)<=Math.max(.55,qty*.005+.05);
   rows.push({symbol:sym,quantity:qty,cost,total:sum,valid});

 }
 return {rows,separators:boundaries.length,raw:'原始分隔線 '+separators.length+' 條，補充分列後 '+boundaries.length+' 條\n'+diagnostics.join('\n')};
}
$('shotFiles').onchange=async e=>{
 shotRows=[];shotGeometry=[];$('shotSave').hidden=true;
 const files=[...e.target.files].slice(0,8);if(!files.length)return;
 $('shotStatus').textContent='載入本機圖片辨識引擎…';
 try{
   if(!window.Tesseract)await new Promise((resolve,reject)=>{
     const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
     script.onload=resolve;script.onerror=()=>reject(Error('文字辨識引擎載入失敗'));document.head.append(script);
   });
   const worker=await window.Tesseract.createWorker('eng');
   const all=[];
   try{
     for(let i=0;i<files.length;i++){
       const f=files[i];if(!f.type.startsWith('image/')||f.size>12e6)throw Error('請選取小於 12 MB 的圖片');
       $('shotStatus').textContent='正在逐欄辨識第 '+(i+1)+'/'+files.length+' 張圖片…';
       const result=await shotExtract(worker,f);
       all.push(result.raw);shotGeometry.push({rows:result.rows});
     }
   }finally{await worker.terminate()}
   $('shotRaw').value=all.join('\n\n');
   shotPrepare();
 }catch(err){$('shotStatus').textContent='辨識失敗：'+err.message}
};
function shotPrepare(){
 shotRows=[];const warnings=[],seen=new Set();
 for(const page of shotGeometry)for(const row of page.rows){if(seen.has(row.symbol)){warnings.push(row.symbol+' 重複');continue}seen.add(row.symbol);shotRows.push(row)}
 const table=$('shotTable');table.innerHTML='';
 const renderRow=r=>{
   const tr=document.createElement('tr');
   for(const prop of ['symbol','quantity','cost','total']){
     const td=document.createElement('td'),input=document.createElement('input');
     input.value=r[prop]===null||r[prop]===undefined?'':String(r[prop]);
     input.dataset.field=prop;input.setAttribute('aria-label',prop);
     if(prop!=='symbol'){input.type='number';input.step='any';input.min='0'}
     td.append(input);tr.append(td);
   }
   const td=document.createElement('td'),btn=document.createElement('button');btn.type='button';btn.textContent='移除';btn.onclick=()=>tr.remove();td.append(btn);tr.append(td);table.append(tr);
 };
 shotRows.forEach(renderRow);
 $('shotAdd').onclick=()=>renderRow({symbol:'',quantity:'',cost:'',total:''});
 $('shotStatus').textContent='分列後預覽 '+shotRows.length+' 筆（其中驗算通過 '+shotRows.filter(r=>r.valid).length+' 筆）。請逐列修正 OCR 結果；空白或驗算不符無法儲存。'+(warnings.length?' '+warnings.slice(0,6).join('；'):'')+'。每筆資料匯入前仍需核對。';
 $('shotSave').hidden=shotRows.length===0;
}
$('shotParse').onclick=()=>{shotGeometry=[];shotPrepare();$('shotStatus').textContent='辨識文字已變更；版面座標已失效，請使用「新增一列」手動輸入並驗算，或重新上傳截圖。'};
$('shotSave').onclick=async()=>{
 if(!user)return;
 const parsed=[],seen=new Set(),exists=new Set(items.map(key));
 try{
   for(const row of $('shotTable').rows){
     const inputs=[...row.querySelectorAll('input')],sym=inputs[0].value.trim().toUpperCase().replace(/\./g,'-');
     if(!sym&&!inputs[1].value&&!inputs[2].value)continue;
     if(!/^[A-Z][A-Z0-9-]{0,14}$/.test(sym))throw Error('股票代碼格式不正確：'+sym);
     const qty=Number(inputs[1].value),cost=Number(inputs[2].value),total=Number(inputs[3].value);
     if(!inputs[3].value.trim()||!(qty>0&&Number.isFinite(qty)&&cost>=0&&Number.isFinite(cost)&&total>=0&&Number.isFinite(total)))throw Error(sym+' 股數、每股成本或總成本不完整');
     if(Math.abs(qty*cost-total)>Math.max(0.55,qty*0.005+0.05))throw Error(sym+' 成本驗算不符，請核對每股及總成本');
     if(seen.has(sym))throw Error('重複股票代碼：'+sym);
     seen.add(sym);
     const value=normalize({account:'firstrade-stock',kind:'stock',symbol:sym,name:stockNameCache.USD.get(sym)||sym,currency:'USD',quantity:qty,cost,price:0});
     if(!exists.has(key(value)))parsed.push(value);
   }
   if(!parsed.length)throw Error('沒有可新增的股票（已存在的股票不覆蓋）');
   if(!confirm('即將新增 '+parsed.length+' 筆 Firstrade 持股，已存在的股票略過。已逐筆核對代碼、股數及成本嗎？'))return;
   download('my-wealth-before-screenshot-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),usdTwd:rate,assets:items.map(({updatedAt,...i})=>i)},null,2),'application/json');
   let n=0;
   for(const value of parsed){
     const created=await runTransaction(db,async tx=>{
       const ref=doc(db,'users',user.uid,'assets',key(value));
       if((await tx.get(ref)).exists())return false;
       tx.set(ref,{...value,updatedAt:serverTimestamp()});return true;
     });
     if(created)n++;
   }
   $('shotStatus').textContent='成功新增 '+n+' 筆。已存在股票略過；備份已下載。請至資產明細確認。';$('shotSave').hidden=true;
 }catch(e){$('shotStatus').textContent='未完成匯入：'+e.message}
};


$('activityCsv').onchange=async e=>{
 const f=e.target.files?.[0];const panel=$('activityPreview');panel.textContent='';if(!f)return;
 try{
  if(f.size>5e6)throw Error('檔案超過 5 MB');
  const raw=await f.text(),lines=[];let row=[],field='',quoted=false;
  for(let i=0;i<raw.length;i++){const ch=raw[i];
   if(ch==='"'&&quoted&&raw[i+1]==='"'){field+='"';i++}
   else if(ch==='"')quoted=!quoted;
   else if(ch===','&&!quoted){row.push(field);field=''}
   else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&raw[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))lines.push(row);row=[];field=''}
   else field+=ch;
  }row.push(field);if(row.some(x=>x.trim()))lines.push(row);
  if(quoted)throw Error('CSV 引號不完整');
  const fields=(lines.shift()||[]).map(x=>x.trim().replace(/^\uFEFF/,''));
  for(const k of ['Symbol','Quantity','Price','Action','TradeDate','Commission','Fee','RecordType'])if(!fields.includes(k))throw Error('缺少欄位 '+k);
  const tx=lines.map((r,index)=>({index,...Object.fromEntries(fields.map((k,i)=>[k,String(r[i]??'').trim()]))}));
  const trades=tx.filter(t=>t.RecordType==='Trade'&&['BUY','SELL'].includes(t.Action));
  const groups=new Map(),problems=[];const num=x=>Number(String(x||'').replace(/[$,\s]/g,''));
  for(const t of trades.sort((a,b)=>a.TradeDate.localeCompare(b.TradeDate)||a.index-b.index)){
   const symbol=t.Symbol.trim().toUpperCase().replace(/\./g,'-'),rawQty=num(t.Quantity),qty=Math.abs(rawQty),price=num(t.Price),fee=num(t.Commission)+num(t.Fee);
   if(!/^[A-Z][A-Z0-9-]{0,15}$/.test(symbol)||!(qty>0&&price>0&&fee>=0)||!((t.Action==='BUY'&&rawQty>0)||(t.Action==='SELL'&&rawQty<0))){problems.push('第 '+(t.index+2)+' 行交易欄位無效');continue}
   const x=groups.get(symbol)||{symbol,quantity:0,basis:0};
   if(t.Action==='BUY'){x.quantity+=qty;x.basis+=qty*price+fee}
   else if(qty>x.quantity+0.00001){problems.push(symbol+' 賣出股數超過本檔歷史買入數，可能有轉入或更早的持股');x.quantity=NaN;x.basis=NaN}
   else if(Number.isFinite(x.quantity)){const avg=x.quantity?x.basis/x.quantity:0;x.quantity=Math.max(0,x.quantity-qty);x.basis=avg*x.quantity}
   groups.set(symbol,x);
  }
  const found=[...groups.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const existing=new Map(items.filter(i=>i.account==='firstrade-stock').map(i=>[i.symbol.toUpperCase(),i]));
  const fmtNum=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:8}):'需核對';
  panel.innerHTML='<p>檔案共 '+tx.length+' 筆活動，含 '+trades.length+' 筆 BUY／SELL，涉及 '+found.length+' 個代號。</p>'+
  '<p class="hint">以下是依買賣紀錄與移動平均成本法估算的結果，不代表 Firstrade 官方庫存。股票分割、轉入與檔案起點以前的持股需人工核對。此功能不寫入 Firebase。</p>'+
  (problems.length?'<p class="hint">異常：'+problems.map(safe).join('；')+'</p>':'')+
  '<div style="overflow:auto"><table><tr><th>代號</th><th>估算股數</th><th>估算每股成本 USD</th><th>My Wealth 股數</th><th>差異</th></tr>'+
  found.map(x=>{const old=existing.get(x.symbol),diff=old&&Number.isFinite(x.quantity)?x.quantity-Number(old.quantity):NaN;return '<tr><td>'+safe(x.symbol)+'</td><td>'+fmtNum(x.quantity)+'</td><td>'+fmtNum(x.quantity>0?x.basis/x.quantity:0)+'</td><td>'+(old?fmtNum(Number(old.quantity)):'未建檔')+'</td><td>'+fmtNum(diff)+'</td></tr>'}).join('')+'</table></div>'+
  '<p class="hint">為避免歷史交易重複入帳，目前只能預覽。完成基準庫存及交易去重後，才會開放確認更新。</p>';
 }catch(err){panel.textContent='分析失敗：'+err.message}
};
