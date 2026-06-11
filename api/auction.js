/**
 * api/auction.js — 서울 열린데이터광장 경매 데이터 프록시
 * GET /api/auction?svc=NMR_AUCT_DTL_INFO&date=20260609
 * GET /api/auction?svc=NMR_AUCT_DTL_INFO&date=20260609&debug=1  ← 원본 필드명 확인용
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

  const { svc, date, debug } = req.query;
  if (!svc || !date) {
    return res.status(400).json({ error: "svc, date 파라미터가 필요합니다." });
  }

  if (!/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: "date 형식 오류 (YYYYMMDD)" });
  }

  const targetUrl = `http://openapi.seoul.go.kr:8088/${apiKey}/json/${svc}/1/1000/SALEDATE/${date}/`;

  try {
    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    const json = JSON.parse(text);

    const topKey   = Object.keys(json)[0] ?? "";
    const result   = json?.[topKey]?.RESULT;
    const rows     = json?.[topKey]?.row ?? [];

    // ?debug=1 : 원본 응답 구조를 그대로 반환 (서비스명·필드명 확인용)
    if (debug === "1") {
      return res.json({
        _debug: true,
        targetUrl: targetUrl.replace(apiKey, "***REDACTED***"),
        topKey,
        result,
        rowCount: rows.length,
        // 처음 2건만 반환 (개인정보 없는 가격 데이터이므로 무방)
        sampleRows: rows.slice(0, 2),
        allFieldNames: rows[0] ? Object.keys(rows[0]) : [],
      });
    }

    if (result?.CODE && result.CODE !== "INFO-000") {
      throw Object.assign(
        new Error(`[${result.CODE}] ${result.MESSAGE}`),
        { apiError: true }
      );
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ topKey, result, rows });

  } catch (error) {
    if (error.name === "TimeoutError") return res.status(504).json({ error: "서울 API 타임아웃" });
    if (error.apiError) return res.status(422).json({ error: error.message, apiError: true });
    res.status(502).json({ error: error.message });
  }
}
