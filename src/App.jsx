import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, BarChart,
} from "recharts";

/* ═══════════════════════════════════════════════════
   API 설정 — 모든 요청은 Vercel 서버리스 함수 경유
   API 키는 서버(환경변수)에만 존재, 클라이언트 미노출
═══════════════════════════════════════════════════ */
const SERVICE_CANDIDATES = [
  "NMR_AUCT_DTL_INFO",
  "WholesaleFoodmarkInfo",
  "MwmtAuctnInfoSvc",
];

async function fetchCatalog() {
  const res = await fetch("/api/catalog?id=OA-2662", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  const json = await res.json();
  const row = json?.SearchCatalogService?.row?.[0];
  return row?.OPENAPI_NM ?? null;
}

async function fetchAuction(svc, date, signal) {
  const res = await fetch(`/api/auction?svc=${encodeURIComponent(svc)}&date=${date}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), {
      apiKeyMissing: res.status === 500 && body.hint,
      apiError: res.status === 400,
    });
  }
  const json = await res.json();
  const topKey = Object.keys(json)[0] ?? "";
  const result = json?.[topKey]?.RESULT;
  if (result?.CODE && result.CODE !== "INFO-000") {
    throw Object.assign(new Error(`[${result.CODE}] ${result.MESSAGE}`), { apiError: true });
  }
  return json?.[topKey]?.row ?? [];
}

/* ═══════════════════════════════════════════════════
   날짜
═══════════════════════════════════════════════════ */
function buildDates(days) {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return d;
  }).filter(d => d.getDay() !== 0).map(d => {
    const m = d.getMonth() + 1, dd = d.getDate();
    const dow = ["일","월","화","수","목","금","토"][d.getDay()];
    return {
      ymd:   `${d.getFullYear()}${String(m).padStart(2,"0")}${String(dd).padStart(2,"0")}`,
      label: `${m}/${dd}(${dow})`,
      full:  `${d.getFullYear()}년 ${m}월 ${dd}일 (${dow})`,
    };
  });
}

/* ═══════════════════════════════════════════════════
   집계
═══════════════════════════════════════════════════ */
function aggregate(rows, fruitName, marketId, keywords, dateLabel, dateFull) {
  const keep = rows.filter(r => {
    const mid  = (r.MID_CLASS_NM ?? "").replace(/\s/g, "");
    const corp = (r.CORP_ITEM_NM ?? r.SMALL_CLASS_NM ?? "").replace(/\s/g, "");
    const mkt  = (r.MARKET_NM   ?? "").replace(/\s/g, "");
    return (mid.includes(fruitName) || corp.includes(fruitName))
        && (mkt.includes(marketId.replace(/\s/g,"")) || marketId === "전체")
        && (keywords.length === 0 || keywords.some(k => corp.includes(k)));
  });
  if (!keep.length) return null;
  const highs = keep.map(r => parseFloat(r.HIGH ?? r.AVG ?? 0)).filter(v => v > 0).sort((a,b) => b-a);
  const avgs  = keep.map(r => parseFloat(r.AVG  ?? 0)).filter(v => v > 0);
  const qtys  = keep.map(r => parseFloat(r.AMT  ?? r.AUCTION_CNT ?? 0));
  if (!highs.length) return null;
  return {
    date: dateLabel, fullDate: dateFull,
    maxPrice: highs[0],
    top15:    highs[Math.max(0, Math.ceil(highs.length * 0.15) - 1)],
    avgPrice: avgs.length ? Math.round(avgs.reduce((s,v)=>s+v,0)/avgs.length) : highs[0],
    qty:      Math.max(0, qtys.reduce((s,v)=>s+v, 0)) || keep.length,
  };
}

/* ═══════════════════════════════════════════════════
   품목 · 품종
═══════════════════════════════════════════════════ */
const FRUITS = [
  {id:"사과",emoji:"🍎"},{id:"배",emoji:"🍐"},{id:"포도",emoji:"🍇"},
  {id:"복숭아",emoji:"🍑"},{id:"딸기",emoji:"🍓"},{id:"수박",emoji:"🍉"},
  {id:"참외",emoji:"🍈"},{id:"감귤",emoji:"🍊"},{id:"바나나",emoji:"🍌"},{id:"체리",emoji:"🍒"},
];
const VARIETIES = {
  "사과":  [{id:"전체",kw:[],tag:"전체",unit:"10kg"},{id:"부사(후지)",kw:["부사","후지"],tag:"대표품종",unit:"10kg"},{id:"홍로",kw:["홍로"],tag:"추석사과",unit:"10kg"},{id:"감홍",kw:["감홍"],tag:"프리미엄",unit:"10kg"},{id:"아오리",kw:["아오리","쓰가루"],tag:"여름사과",unit:"10kg"},{id:"양광",kw:["양광"],tag:"중생종",unit:"10kg"}],
  "배":    [{id:"전체",kw:[],tag:"전체",unit:"15kg"},{id:"신고",kw:["신고"],tag:"대표품종",unit:"15kg"},{id:"원황",kw:["원황"],tag:"추석배",unit:"15kg"},{id:"황금배",kw:["황금"],tag:"프리미엄",unit:"15kg"},{id:"추황배",kw:["추황"],tag:"만생종",unit:"15kg"},{id:"만풍배",kw:["만풍"],tag:"신품종",unit:"15kg"}],
  "포도":  [{id:"전체",kw:[],tag:"전체",unit:"5kg"},{id:"샤인머스캣",kw:["샤인"],tag:"프리미엄",unit:"2kg"},{id:"거봉",kw:["거봉"],tag:"대표품종",unit:"5kg"},{id:"캠벨얼리",kw:["캠벨"],tag:"다량생산",unit:"5kg"},{id:"MBA(머루포도)",kw:["MBA","머루"],tag:"가공용",unit:"5kg"},{id:"홍이슬",kw:["홍이슬"],tag:"신품종",unit:"3kg"}],
  "복숭아":[{id:"전체",kw:[],tag:"전체",unit:"4.5kg"},{id:"천중도백도",kw:["천중도","백도"],tag:"대표품종",unit:"4.5kg"},{id:"황도",kw:["황도"],tag:"가공용",unit:"4.5kg"},{id:"유명",kw:["유명"],tag:"중생종",unit:"4.5kg"},{id:"미백도",kw:["미백"],tag:"프리미엄",unit:"4.5kg"}],
  "딸기":  [{id:"전체",kw:[],tag:"전체",unit:"2kg"},{id:"설향",kw:["설향"],tag:"대표품종",unit:"2kg"},{id:"죽향",kw:["죽향"],tag:"프리미엄",unit:"1kg"},{id:"금실",kw:["금실"],tag:"고당도",unit:"2kg"},{id:"매향",kw:["매향"],tag:"수출품종",unit:"2kg"},{id:"아리향",kw:["아리향"],tag:"신품종",unit:"2kg"},{id:"킹스베리",kw:["킹스베리"],tag:"대왕딸기",unit:"1kg"}],
  "수박":  [{id:"전체",kw:[],tag:"전체",unit:"8~10kg"},{id:"흑피수박",kw:["흑피"],tag:"대표품종",unit:"8kg"},{id:"애플수박",kw:["애플"],tag:"소형",unit:"3kg"},{id:"미니수박",kw:["미니"],tag:"1인용",unit:"2kg"},{id:"노란수박",kw:["노란"],tag:"황육",unit:"8kg"}],
  "참외":  [{id:"전체",kw:[],tag:"전체",unit:"5kg"},{id:"황금참외",kw:["황금"],tag:"대표품종",unit:"5kg"},{id:"얼룩이참외",kw:["얼룩이"],tag:"전통품종",unit:"5kg"},{id:"은천참외",kw:["은천"],tag:"중생종",unit:"5kg"},{id:"금싸라기참외",kw:["금싸라기"],tag:"고당도",unit:"5kg"}],
  "감귤":  [{id:"전체",kw:[],tag:"전체",unit:"5kg"},{id:"온주밀감",kw:["온주","밀감"],tag:"대표품종",unit:"5kg"},{id:"한라봉",kw:["한라봉"],tag:"프리미엄",unit:"3kg"},{id:"천혜향",kw:["천혜향"],tag:"고급브랜드",unit:"3kg"},{id:"레드향",kw:["레드향"],tag:"최고급",unit:"3kg"},{id:"황금향",kw:["황금향"],tag:"신품종",unit:"3kg"},{id:"카라향",kw:["카라향"],tag:"희귀품종",unit:"3kg"}],
  "바나나":[{id:"전체",kw:[],tag:"전체",unit:"13kg"},{id:"일반바나나",kw:["바나나"],tag:"일반",unit:"13kg"},{id:"유기농",kw:["유기","친환경"],tag:"친환경",unit:"13kg"}],
  "체리":  [{id:"전체",kw:[],tag:"전체",unit:"5kg"},{id:"미국산",kw:["미국","빙체리"],tag:"수입",unit:"5kg"},{id:"캐나다산",kw:["캐나다"],tag:"수입",unit:"5kg"},{id:"국내산",kw:["국내","홍등"],tag:"국내산",unit:"2kg"},{id:"칠레산",kw:["칠레"],tag:"수입",unit:"5kg"}],
};
const MARKETS=[{id:"가락시장",label:"가락동 청과시장"},{id:"강서시장",label:"강서 청과시장"}];
const PERIODS=[{label:"1주일",days:7},{label:"보름",days:15},{label:"한달",days:30}];

/* ═══════════════════════════════════════════════════
   시뮬레이션
═══════════════════════════════════════════════════ */
const FB={사과:{b:45000,v:7000,q:2500},배:{b:55000,v:9000,q:1800},포도:{b:38000,v:7000,q:3200},복숭아:{b:32000,v:6000,q:2800},딸기:{b:28000,v:5000,q:4500},수박:{b:22000,v:4000,q:900},참외:{b:30000,v:5500,q:2100},감귤:{b:18000,v:3000,q:5500},바나나:{b:15000,v:2500,q:1200},체리:{b:68000,v:12000,q:800}};
function sr(s){const x=Math.sin(s+1)*10000;return x-Math.floor(x);}
function makeSim(fruit,variety,dates){
  const fb=FB[fruit]||{b:40000,v:7000,q:2000};let sd=(fruit.charCodeAt(0)*17)+(variety.charCodeAt(0)*31);
  return dates.map(({label,full})=>{
    const r1=sr(sd++),r2=sr(sd++),r3=sr(sd++),r4=sr(sd++);
    const mp=Math.round((fb.b+Math.sin(sd*0.28)*fb.v*0.28+(r1-.5)*fb.v)/100)*100;
    return{date:label,fullDate:full,maxPrice:mp,top15:Math.round(mp*(.70+r2*.12)),avgPrice:Math.round(mp*(.58+r3*.12)),qty:Math.max(5,Math.round(fb.q*(.65+r4*.70)))};
  });
}

/* ═══════════════════════════════════════════════════
   유틸
═══════════════════════════════════════════════════ */
const won=v=>`₩${Math.round(Number(v)||0).toLocaleString()}`;
const num=v=>Math.round(Number(v)||0).toLocaleString();
const TC=t=>({전체:"#475569",대표품종:"#34d399",프리미엄:"#fbbf24",최고급:"#f59e0b",고급브랜드:"#fbbf24",희귀품종:"#c084fc",수입:"#94a3b8",국내산:"#f87171"}[t]||"#38bdf8");

const PT=({active,payload,label})=>!active||!payload?.length?null:(
  <div style={{background:"#0c1830",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px",fontSize:12,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
    <p style={{color:"#94a3b8",marginBottom:6,fontWeight:600}}>{label}</p>
    {payload.map(p=><p key={p.name} style={{color:p.color,margin:"2px 0"}}>{p.name}: <strong>{won(p.value)}</strong></p>)}
  </div>);
const QT=({active,payload,label})=>!active||!payload?.length?null:(
  <div style={{background:"#0c1830",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px",fontSize:12,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
    <p style={{color:"#94a3b8",marginBottom:6,fontWeight:600}}>{label}</p>
    <p style={{color:"#38bdf8",margin:0}}>경매 수량: <strong>{num(payload[0]?.value)} 단위</strong></p>
  </div>);

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
═══════════════════════════════════════════════════ */
export default function App() {
  const [fruit,   setFruit]   = useState("사과");
  const [variety, setVariety] = useState("전체");
  const [market,  setMarket]  = useState("가락시장");
  const [period,  setPeriod]  = useState(PERIODS[0]);
  const [tab,     setTab]     = useState("price");

  const [data,      setData]      = useState([]);
  const [apiMode,   setApiMode]   = useState("sim");
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [log,       setLog]       = useState([]);
  const [activeSvc, setActiveSvc] = useState("");
  const [apiKeyErr, setApiKeyErr] = useState(false);
  const [now,       setNow]       = useState(new Date());
  const [foundSvc,  setFoundSvc]  = useState(null);

  const abortRef = useRef(null);
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t);},[]);

  const handleFruitChange = f => { setFruit(f); setVariety("전체"); };
  const varietyObj = (VARIETIES[fruit]||[]).find(v=>v.id===variety)||VARIETIES[fruit]?.[0];
  const fruitInfo  = FRUITS.find(f=>f.id===fruit);
  const marketObj  = MARKETS.find(m=>m.id===market)||MARKETS[0];

  // 서비스명 자동탐색
  useEffect(() => {
    fetchCatalog().then(nm => { if (nm) setFoundSvc(nm); }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    const dates = buildDates(period.days);

    setLoading(true); setLog([]); setProgress(0); setActiveSvc(""); setApiKeyErr(false);
    const addLog = msg => setLog(prev => [...prev, msg]);
    addLog(`📅 ${dates.length}일 · ${fruit} ${variety} · ${marketObj.label}`);

    const candidates = [foundSvc, ...SERVICE_CANDIDATES].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
    const rows = []; let usedSvc = "";

    outer: for (const svc of candidates) {
      addLog(`🔄 서비스명: ${svc}`);
      let errCnt = 0;
      for (let i = 0; i < dates.length; i++) {
        if (signal.aborted) break outer;
        setProgress(Math.round((i / dates.length) * 100));
        try {
          const dayRows = await fetchAuction(svc, dates[i].ymd, signal);
          if (!usedSvc) { usedSvc = svc; setActiveSvc(svc); }
          const kw  = varietyObj?.kw ?? [];
          const row = aggregate(dayRows, fruit, market, kw, dates[i].label, dates[i].full);
          if (row) rows.push(row);
          errCnt = 0;
        } catch (e) {
          if (signal.aborted) break outer;
          if (e.apiKeyMissing) { setApiKeyErr(true); addLog("❌ SEOUL_API_KEY 환경변수 미설정"); break outer; }
          if (e.apiError)      { addLog(`❌ API 오류(${svc}): ${e.message.slice(0,80)}`); break; }
          errCnt++;
          if (errCnt >= 3)     { addLog(`❌ 연속 실패 → 다음 서비스명`); break; }
        }
      }
      if (rows.length > 0) break outer;
    }

    setProgress(100);
    if (rows.length > 0) {
      addLog(`✅ ${rows.length}일 데이터 수집 완료 (${usedSvc})`);
      setData(rows); setApiMode("live");
    } else {
      addLog("❌ 데이터 없음 → 시뮬레이션 표시");
      setData(makeSim(fruit, variety, dates));
      setApiMode("error");
    }
    setLoading(false);
  }, [fruit, variety, period, market, foundSvc, varietyObj]);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = useMemo(() => {
    if (!data.length) return {};
    const ma=data.map(d=>d.maxPrice),t15=data.map(d=>d.top15),qa=data.map(d=>d.qty);
    return{maxHigh:Math.max(...ma),maxLow:Math.min(...ma),maxAvg:Math.round(ma.reduce((a,b)=>a+b,0)/ma.length),
      t15High:Math.max(...t15),t15Low:Math.min(...t15),t15Avg:Math.round(t15.reduce((a,b)=>a+b,0)/t15.length),
      totalQty:qa.reduce((a,b)=>a+b,0),avgQty:Math.round(qa.reduce((a,b)=>a+b,0)/qa.length),
      last:data[data.length-1],prev:data[data.length-2]};
  },[data]);

  const diff=stats.last&&stats.prev?stats.last.maxPrice-stats.prev.maxPrice:0;
  const dCol=diff>=0?"#f87171":"#34d399";

  const pill=(a,c="#0ea5e9")=>({background:a?`${c}22`:"#0c1e38",border:`1px solid ${a?c:"#1a3a60"}`,color:a?c:"#94a3b8",borderRadius:6,padding:"6px 14px",cursor:"pointer",fontSize:13,fontWeight:a?700:400,transition:"all .15s",whiteSpace:"nowrap"});
  const tabBtn=a=>({background:a?"#1e3a5f":"transparent",color:a?"#7dd3fc":"#475569",border:"none",borderRadius:6,padding:"7px 18px",cursor:"pointer",fontSize:13,fontWeight:a?700:400,transition:"all .15s"});
  const LBL={fontSize:9,color:"#475569",letterSpacing:2,textTransform:"uppercase",marginBottom:6};
  const CARD={background:"#0c1830",border:"1px solid #1a3a60",borderRadius:12,padding:"18px 16px"};

  return (
    <div style={{minHeight:"100vh",background:"#06101f",color:"#e2e8f0",fontFamily:"'Noto Sans KR','Malgun Gothic',sans-serif",paddingBottom:48}}>

      {/* 헤더 */}
      <div style={{background:"linear-gradient(135deg,#0c1e38,#091b36)",borderBottom:"1px solid #1a3a60",padding:"13px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>🏪</span>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#f0fdf4",letterSpacing:-0.5}}>청과 경매 정보 시스템</div>
            <div style={{fontSize:9,color:"#64748b",letterSpacing:1.5,textTransform:"uppercase"}}>서울 열린데이터광장 OA-2662 · Vercel 서버리스 프록시</div>
          </div>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          {apiMode==="live"  && <span style={{background:"#052e16",border:"1px solid #16a34a",borderRadius:6,padding:"3px 10px",fontSize:10,color:"#34d399"}}>● LIVE · {activeSvc}</span>}
          {apiMode==="sim"   && <span style={{background:"#1c1917",border:"1px solid #57534e",borderRadius:6,padding:"3px 10px",fontSize:10,color:"#78716c"}}>◈ 시뮬레이션</span>}
          {apiMode==="error" && <span style={{background:"#450a0a",border:"1px solid #b91c1c",borderRadius:6,padding:"3px 10px",fontSize:10,color:"#f87171"}}>⚠ 오류→시뮬</span>}
          <span style={{fontSize:11,color:"#475569"}}>{now.toLocaleString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
        </div>
      </div>

      {/* API 키 미설정 경고 */}
      {apiKeyErr && (
        <div style={{background:"#450a0a",borderBottom:"1px solid #b91c1c",padding:"12px 24px",fontSize:12,color:"#f87171"}}>
          ⚠ <strong>SEOUL_API_KEY 환경변수가 설정되지 않았습니다.</strong>
          <span style={{color:"#94a3b8",marginLeft:8}}>Vercel Dashboard → Settings → Environment Variables에 추가하세요.</span>
        </div>
      )}

      {/* 로딩 바 */}
      {loading && (
        <div style={{background:"#0c1e38",borderBottom:"1px solid #1a3a60",padding:"7px 24px"}}>
          <div style={{maxWidth:960,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:11,color:"#64748b"}}>
              <span>🔄 경매 데이터 수집 중…</span><span>{progress}%</span>
            </div>
            <div style={{background:"#0a1628",borderRadius:999,height:3}}>
              <div style={{background:"#0ea5e9",width:`${progress}%`,height:"100%",borderRadius:999,transition:"width .3s"}}/>
            </div>
          </div>
        </div>
      )}

      <div style={{padding:"16px 24px",maxWidth:1100,margin:"0 auto"}}>

        {/* 시장 & 기간 */}
        <div style={{display:"flex",gap:28,marginBottom:14,flexWrap:"wrap"}}>
          <div><div style={LBL}>시장</div><div style={{display:"flex",gap:6}}>{MARKETS.map(m=><button key={m.id} style={pill(market===m.id)} onClick={()=>setMarket(m.id)}>{m.label}</button>)}</div></div>
          <div><div style={LBL}>기간</div><div style={{display:"flex",gap:6}}>{PERIODS.map(p=><button key={p.label} style={pill(period.label===p.label)} onClick={()=>setPeriod(p)}>{p.label}</button>)}</div></div>
        </div>

        {/* 품목 */}
        <div style={{marginBottom:11}}>
          <div style={LBL}>품목</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {FRUITS.map(f=>(
              <button key={f.id} onClick={()=>handleFruitChange(f.id)} style={{background:fruit===f.id?"#0f2d4a":"#0c1830",border:`2px solid ${fruit===f.id?"#0ea5e9":"#1a3a60"}`,color:fruit===f.id?"#7dd3fc":"#64748b",borderRadius:10,padding:"7px 12px",cursor:"pointer",fontSize:13,fontWeight:fruit===f.id?700:400,transition:"all .15s",display:"flex",alignItems:"center",gap:4}}>
                <span>{f.emoji}</span>{f.id}
              </button>
            ))}
          </div>
        </div>

        {/* 품종 */}
        <div style={{background:"#0a1628",border:"1px solid #1a3a60",borderRadius:10,padding:"11px 14px",marginBottom:14}}>
          <div style={{...LBL,marginBottom:8}}>{fruit} 품종</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {(VARIETIES[fruit]||[]).map(v=>{const a=variety===v.id;const tc=TC(v.tag);return(
              <button key={v.id} onClick={()=>setVariety(v.id)} style={{background:a?"#112240":"#0c1830",border:`1.5px solid ${a?tc:"#1a3a60"}`,borderRadius:8,padding:"7px 11px",cursor:"pointer",textAlign:"left",minWidth:88}}>
                <div style={{fontSize:12,fontWeight:a?700:400,color:a?"#f0fdf4":"#94a3b8",marginBottom:3}}>{v.id}</div>
                <div style={{fontSize:9,fontWeight:700,color:tc,background:`${tc}18`,borderRadius:3,padding:"1px 5px",display:"inline-block",marginBottom:2}}>{v.tag}</div>
                <div style={{fontSize:9,color:"#334155"}}>{v.unit}</div>
              </button>
            );})}
          </div>
        </div>

        {/* 현재 선택 요약 */}
        <div style={{background:"linear-gradient(90deg,#0f2d4a,#0c1830)",border:"1px solid #1a3a60",borderRadius:10,padding:"12px 18px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:30}}>{fruitInfo?.emoji}</span>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                <span style={{fontSize:18,fontWeight:800,color:"#f0fdf4"}}>{fruit}</span>
                <span style={{fontSize:13,fontWeight:700,color:"#7dd3fc"}}>· {variety}</span>
                <span style={{fontSize:9,fontWeight:700,color:TC(varietyObj?.tag),background:`${TC(varietyObj?.tag)}20`,borderRadius:4,padding:"2px 6px"}}>{varietyObj?.tag}</span>
              </div>
              <div style={{fontSize:10,color:"#475569",marginTop:2}}>
                {marketObj.label} · {period.label} · {varietyObj?.unit}
                {apiMode==="live"&&<span style={{color:"#34d399",marginLeft:6}}>● 실시간</span>}
                {apiMode==="sim" &&<span style={{color:"#57534e",marginLeft:6}}>◈ 시뮬</span>}
              </div>
            </div>
          </div>
          {stats.last&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:800,color:"#f0fdf4",fontVariantNumeric:"tabular-nums"}}>{won(stats.last.maxPrice)}</div>
              <div style={{fontSize:11,color:dCol,fontWeight:600}}>{diff>=0?"▲":"▼"} {won(Math.abs(diff))} 전일比</div>
            </div>
          )}
        </div>

        {/* 통계 카드 */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:11,marginBottom:14}}>
          {[
            {l:"경매 최고가",v:won(stats.maxHigh),s:`최저 ${won(stats.maxLow)} · 평균 ${won(stats.maxAvg)}`,c:"#f87171"},
            {l:"상위 15% 가격",v:won(stats.t15High),s:`최저 ${won(stats.t15Low)} · 평균 ${won(stats.t15Avg)}`,c:"#fbbf24"},
            {l:"총 경매 수량",v:num(stats.totalQty),s:`일평균 ${num(stats.avgQty)} 단위`,c:"#34d399"},
            {l:"집계 일수",v:`${data.length}일`,s:`${data[0]?.date} ~ ${data[data.length-1]?.date}`,c:"#38bdf8"},
          ].map(({l,v,s,c})=>(
            <div key={l} style={{background:"#0c1830",borderRadius:10,padding:"11px 13px",borderLeft:`3px solid ${c}`,border:`1px solid ${c}22`,borderLeftWidth:3,borderLeftStyle:"solid",borderLeftColor:c}}>
              <div style={{fontSize:9,color:"#64748b",letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>{l}</div>
              <div style={{fontSize:19,fontWeight:800,color:c,fontVariantNumeric:"tabular-nums"}}>{v}</div>
              <div style={{fontSize:10,color:"#475569",marginTop:2}}>{s}</div>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div style={{display:"flex",gap:2,marginBottom:12,background:"#0c1830",borderRadius:8,padding:4,width:"fit-content"}}>
          {[["price","📈 가격 추이"],["qty","📊 수량 추이"],["table","🗂 데이터 표"]].map(([k,l])=>(
            <button key={k} style={tabBtn(tab===k)} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* 가격 차트 */}
        {tab==="price"&&(
          <div style={CARD}>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12,fontWeight:600}}>
              {fruit} · {variety} 가격 추이 — {marketObj.label} ({period.label})
              <span style={{fontSize:10,color:"#475569",marginLeft:8}}>원/{varietyObj?.unit}</span>
            </div>
            <ResponsiveContainer width="100%" height={290}>
              <ComposedChart data={data} margin={{top:8,right:20,left:10,bottom:8}}>
                <defs>
                  <linearGradient id="gH" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.3}/><stop offset="100%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity={0.2}/><stop offset="100%" stopColor="#fbbf24" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a60"/>
                <XAxis dataKey="date" tick={{fill:"#475569",fontSize:10}} axisLine={{stroke:"#1a3a60"}} tickLine={false}/>
                <YAxis tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{fill:"#475569",fontSize:10}} axisLine={{stroke:"#1a3a60"}} tickLine={false}/>
                <Tooltip content={<PT/>}/>
                <Legend wrapperStyle={{fontSize:11,paddingTop:10}} formatter={v=><span style={{color:"#94a3b8"}}>{v}</span>}/>
                <Area dataKey="maxPrice" name="경매 최고가"   type="monotone" stroke="#f87171" fill="url(#gH)" strokeWidth={2} dot={false}/>
                <Area dataKey="top15"    name="상위 15% 가격" type="monotone" stroke="#fbbf24" fill="url(#gT)" strokeWidth={2} dot={false}/>
                <Line  dataKey="avgPrice" name="평균 낙찰가"  type="monotone" stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="4 3"/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 수량 차트 */}
        {tab==="qty"&&(
          <div style={CARD}>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12,fontWeight:600}}>
              {fruit} · {variety} 경매 수량 — {marketObj.label} ({period.label})
            </div>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={data} margin={{top:8,right:20,left:10,bottom:8}}>
                <defs><linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9}/><stop offset="100%" stopColor="#0284c7" stopOpacity={0.5}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a60"/>
                <XAxis dataKey="date" tick={{fill:"#475569",fontSize:10}} axisLine={{stroke:"#1a3a60"}} tickLine={false}/>
                <YAxis tick={{fill:"#475569",fontSize:10}} axisLine={{stroke:"#1a3a60"}} tickLine={false} tickFormatter={num}/>
                <Tooltip content={<QT/>}/>
                <Bar dataKey="qty" name="경매 수량" fill="url(#bG)" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 데이터 표 */}
        {tab==="table"&&(
          <div style={CARD}>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12,fontWeight:600}}>
              {fruit} · {variety} 일별 경매 데이터 — {marketObj.label} ({period.label})
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#0a1628"}}>{["날짜","경매 최고가","상위 15%","평균 낙찰가","전일比","경매 수량"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",color:"#475569",fontWeight:600,fontSize:9,letterSpacing:1,textTransform:"uppercase",borderBottom:"1px solid #1a3a60"}}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...data].reverse().map((row,i)=>{
                    const prev=data[data.length-2-i];const d=prev?row.maxPrice-prev.maxPrice:0;
                    return(
                      <tr key={row.date} style={{background:i%2===0?"#0c1830":"#0a1628"}}>
                        <td style={{padding:"8px 12px",color:"#94a3b8",fontWeight:500}}>{row.fullDate}</td>
                        <td style={{padding:"8px 12px",color:"#f87171",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{won(row.maxPrice)}</td>
                        <td style={{padding:"8px 12px",color:"#fbbf24",fontVariantNumeric:"tabular-nums"}}>{won(row.top15)}</td>
                        <td style={{padding:"8px 12px",color:"#94a3b8",fontVariantNumeric:"tabular-nums"}}>{won(row.avgPrice)}</td>
                        <td style={{padding:"8px 12px",fontVariantNumeric:"tabular-nums",fontWeight:600,color:d===0?"#475569":d>0?"#f87171":"#34d399"}}>{d===0?"—":`${d>0?"▲":"▼"} ${won(Math.abs(d))}`}</td>
                        <td style={{padding:"8px 12px",color:"#38bdf8",fontVariantNumeric:"tabular-nums"}}>{num(row.qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 진단 로그 */}
        {log.length > 0 && (
          <details style={{marginTop:12}}>
            <summary style={{fontSize:11,color:"#475569",cursor:"pointer",userSelect:"none"}}>📋 진단 로그</summary>
            <div style={{background:"#020b18",border:"1px solid #1a3a60",borderRadius:8,padding:"10px 13px",maxHeight:160,overflowY:"auto",marginTop:6}}>
              {log.map((l,i)=>(
                <div key={i} style={{fontSize:11,lineHeight:1.8,color:l.startsWith("✅")?"#34d399":l.startsWith("❌")?"#f87171":l.startsWith("⚠")?"#fbbf24":"#94a3b8"}}>{l}</div>
              ))}
            </div>
          </details>
        )}

        <div style={{marginTop:11,padding:"8px 12px",background:"#0a1628",border:"1px solid #1a3a60",borderRadius:8,fontSize:10,color:"#475569",lineHeight:1.6}}>
          <span style={{color:"#fbbf24"}}>ℹ </span>OA-2662 · 갱신 월~토 낮 12시 · 공공누리 1유형 · 저작권 서울시농수산식품공사
        </div>
      </div>
    </div>
  );
}
