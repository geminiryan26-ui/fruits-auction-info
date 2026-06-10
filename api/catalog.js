/**
 * api/catalog.js — 서울 열린데이터광장 서비스명 자동탐색
 *
 * sample 키를 사용하므로 개인 API 키 불필요
 * 호출 예시: GET /api/catalog?id=OA-2662
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query.id || "OA-2662";
  const url = `http://openapi.seoul.go.kr:8088/sample/json/SearchCatalogService/1/5/${id}/openapi/`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
}
