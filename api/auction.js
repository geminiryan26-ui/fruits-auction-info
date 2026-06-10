/**
 * api/auction.js — 서울 열린데이터광장 경매 데이터 프록시
 *
 * 환경변수: SEOUL_API_KEY (Vercel Dashboard > Settings > Environment Variables)
 *
 * 호출 예시:
 *   GET /api/auction?svc=NMR_AUCT_DTL_INFO&date=20260609
 *
 * API 키는 절대 클라이언트에 노출되지 않습니다.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "SEOUL_API_KEY 환경변수가 설정되지 않았습니다.",
      hint: "Vercel Dashboard > Settings > Environment Variables 에 SEOUL_API_KEY를 추가하세요.",
    });
  }

  const { svc, date } = req.query;
  if (!svc || !date) {
    return res.status(400).json({ error: "svc, date 파라미터가 필요합니다." });
  }

  // 날짜 형식 검증 (YYYYMMDD)
  if (!/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: "date 형식이 올바르지 않습니다. (YYYYMMDD)" });
  }

  const targetUrl = `http://openapi.seoul.go.kr:8088/${apiKey}/json/${svc}/1/1000/SALEDATE/${date}/`;

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(12000),
    });

    const text = await response.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(text);
  } catch (error) {
    if (error.name === "TimeoutError") {
      return res.status(504).json({ error: "서울 API 응답 시간 초과" });
    }
    res.status(502).json({ error: error.message });
  }
}
