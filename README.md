# 청과 경매 정보 시스템

서울 열린데이터광장 OA-2662 (서울시농수산식품공사 유통정보-경매결과) 기반 실시간 경매 데이터 대시보드.

## 기술 스택

- **프론트엔드**: React 18 + Vite + Recharts
- **백엔드**: Vercel Serverless Functions (Node.js 20)
- **데이터 출처**: 서울 열린데이터광장 OA-2662

## 배포 방법 (Vercel)

### 1단계 — GitHub 레포 생성 후 푸시

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/{your-username}/{repo-name}.git
git push -u origin main
```

### 2단계 — Vercel에 연결

1. [vercel.com](https://vercel.com) 로그인 (GitHub 계정 연동)
2. **Add New Project** → GitHub 레포 선택
3. Framework: **Vite** (자동 감지됨)
4. **Deploy** 클릭

### 3단계 — 환경변수 설정 (핵심)

Vercel Dashboard → 프로젝트 선택 → **Settings** → **Environment Variables**

| Name | Value |
|------|-------|
| `SEOUL_API_KEY` | `xxxxxxxxxxxxxx` (본인 인증키) |

저장 후 **Deployments** 탭에서 **Redeploy** 클릭.

---

## 로컬 개발

```bash
npm install
npm install -g vercel    # Vercel CLI 설치

# .env.local 파일 생성
echo "SEOUL_API_KEY=여기에_인증키_입력" > .env.local

npm run dev              # vercel dev 실행 (프론트 + API 함수 동시 실행)
```

브라우저에서 `http://localhost:3000` 접속.

---

## 프로젝트 구조

```
fruit-market/
├── api/
│   ├── auction.js    # 서울 API 프록시 (SEOUL_API_KEY 주입)
│   └── catalog.js    # 서비스명 자동탐색 (sample 키 사용)
├── src/
│   ├── App.jsx       # 메인 React 컴포넌트
│   └── main.jsx      # 진입점
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .gitignore
```

## 보안

- API 키는 `SEOUL_API_KEY` 환경변수에만 저장
- 클라이언트(브라우저) 코드에 API 키 미노출
- Vercel 서버리스 함수가 API 키를 서울 서버에 직접 전달
- 출처표시 필수: 공공누리 1유형 (서울시농수산식품공사)
