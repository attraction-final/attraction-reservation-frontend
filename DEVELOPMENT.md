# 프론트엔드 개발 가이드

[README](https://github.com/attraction-final/attraction-reservation-frontend/blob/main/README.md)에서 다루지 않은 **개발용 상세 내용**을 정리한 문서입니다.
기술 스택과 버전은 README의 [3. 기술 스택]을 참고해 주세요.

---

## 1. 실행하기

준비물
- [Node.js](https://nodejs.org) 18 이상 (LTS 버전 추천)
- **스프링부트 백엔드가 `localhost:8080` 에서 켜져 있어야 합니다.** (가짜 데이터가 없어서 백엔드 없이는 화면에 데이터가 보이지 않습니다)

```bash
cd attraction-reservation-frontend
npm install      # 처음 한 번만: 필요한 라이브러리 내려받기
npm run dev      # 개발 서버 실행 → http://localhost:5173
```

| 명령어 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 (코드 고치면 바로 반영) |
| `npm run build` | 배포용 파일을 `dist/` 폴더에 만들기 |
| `npm run preview` | 만들어진 `dist/` 를 미리 띄워 보기 |

### 계정
- **일반 회원**: 로그인 화면에서 회원가입하면 됩니다. (카카오 · 구글 소셜 로그인도 있습니다 → 3번 참고)
- **관리자**: `role = ADMIN` 인 계정으로 로그인한 뒤 `http://localhost:5173/admin` 으로 들어갑니다.
  관리자 계정을 만드는 방법은 백엔드 쪽 문서를 확인해 주세요.

---

## 2. 폴더 구조 (어디에 무엇이 있나요?)

```
attraction-reservation-frontend/
├─ index.html                 # 앱이 그려지는 빈 HTML (폰트 불러오기)
├─ vite.config.js             # 개발 서버 설정 (/api → 스프링부트 8080 으로 전달)
├─ .env.development           # 개발용 설정 (소셜 로그인 백엔드 주소, 카카오맵 키)
├─ .env.production            # 배포용 설정
├─ public/images/             # 어트랙션 사진, 로고
└─ src/
   ├─ main.jsx                # 시작점
   ├─ App.jsx                 # 주소 ↔ 화면 연결표 (라우터)
   ├─ config.js               # 서비스 이름, API·소셜 로그인 주소, 카카오맵 키
   ├─ styles.css              # 색상·버튼·휴대폰 틀 등 공통 디자인
   ├─ api/
   │  ├─ http.js              # ★ 모든 요청이 지나가는 문 (토큰·CSRF·재발급·응답 포장 벗기기·주소 검사)
   │  ├─ index.js             # ★ 화면에서 쓰는 API 함수 + 백엔드 응답 → 화면 모양 변환(toXxx)
   │  ├─ labels.js            # 상태 코드 → 한국어/배지 색, 날짜·가격 표시 함수
   │  ├─ geolocation.js       # 루트 추천 요청 직전에 현재 위치를 "한 번" 받기
   │  ├─ kakaoMap.js          # 카카오맵 SDK 를 한 번만 불러오기
   │  └─ ApiError.js
   ├─ hooks/
   │  ├─ useApi.js            # 화면이 열릴 때 데이터 불러오기 도우미
   │  └─ useGeolocation.js    # 내 위치 "계속" 따라가기 (지도 위 점, 가까운 순)
   ├─ utils/geo.js            # 거리 계산(하버사인), 도보 시간 추정
   ├─ context/AuthContext.jsx # 로그인 정보 저장소 (로그인·소셜 로그인·로그아웃·탈퇴)
   ├─ components/
   │  ├─ DeviceFrame.jsx      # PC 에서 보이는 휴대폰 틀
   │  ├─ RequireAdmin.jsx     # 관리자 화면 문지기
   │  ├─ AttractionMap.jsx    # 루트 추천 지도 (카카오맵)
   │  ├─ SimpleAttractionMap.jsx  # 루트 추천 지도 (카카오 키가 없을 때 쓰는 간이 지도)
   │  ├─ AttractionPreviewSheet.jsx  # 지도에서 핀을 눌렀을 때 뜨는 미리보기
   │  ├─ mapPin.js            # 두 지도가 같이 쓰는 핀 모양 규칙
   │  ├─ PasswordChangeSheet.jsx  # 비밀번호 변경 창
   │  ├─ WithdrawSheet.jsx    # 회원 탈퇴 창
   │  ├─ OrderCancelSheet.jsx, ReservationCancelSheet.jsx  # 주문·예약 취소 확인 창
   │  ├─ ui.jsx               # 탭바, 배지, 헤더 같은 공통 부품
   │  └─ Icon.jsx
   └─ pages/                  # 사용자 화면 (admin/ 은 관리자 화면)
```

### 화면 ↔ 주소

**사용자 화면**

| 화면 | 주소 |
|---|---|
| 홈 | `/` |
| 로그인 · 회원가입 | `/login` |
| 소셜 로그인 도착 | `/oauth/callback` |
| 어트랙션 목록 / 상세·슬롯 예약 | `/attractions`, `/attractions/:id` |
| 어트랙션 질문 (채팅처럼 묻고 답하기) | `/attractions/ask` |
| 입장권 선택 → 주문·결제 → 결제 완료 | `/tickets` → `/checkout/:orderId` → `/checkout/:orderId/complete` |
| 루트 추천 조건 → 결과 | `/route` → `/route/result` |
| 내 예약 / 예약 상세 | `/my/reservations`, `/my/reservations/:id` |
| 내 입장권 / 마이페이지 | `/my/tickets`, `/my` |

**관리자 화면** (`RequireAdmin` 이 지킵니다 → 비로그인은 로그인 화면으로, 일반 회원은 "권한 없음" 안내)

| 화면 | 주소 |
|---|---|
| 어트랙션 · 슬롯 관리 (`/admin` 으로 오면 여기로 이동) | `/admin/slots` |
| 어트랙션 등록 / 수정 | `/admin/attractions/new`, `/admin/attractions/:id/edit` |
| 예약 관리 | `/admin/reservations` |
| 회원 관리 | `/admin/members` |
| 입장권 상품 관리 | `/admin/products` |
| 주문 · 환불 관리 | `/admin/orders` |
| 입장 처리 (입장권 코드 → 입장 완료) | `/admin/entry` |

없는 주소로 들어오면 홈(`/`)으로 돌아갑니다.

---

## 3. 환경 설정

### 프론트 `.env`

| 파일 | 값 | 설명 |
|---|---|---|
| `.env.development` | `VITE_OAUTH_BASE_URL=http://localhost:8080` | 소셜 로그인 버튼이 이동할 백엔드 주소 |
| `.env.production` | `VITE_OAUTH_BASE_URL=https://api.xevbn.click` | 배포용 소셜 로그인 백엔드 주소입니다. 프론트(Vercel)와 백엔드 주소가 달라서 백엔드 주소를 적습니다. (같은 주소로 배포한다면 비워 둡니다) |
| `.env.local` (깃 제외) | `VITE_KAKAO_MAP_APP_KEY=키` | 루트 추천 화면의 카카오맵 JavaScript 키입니다. 깃에 올라가는 `.env.development`, `.env.production` 에는 빈 값으로 두고, 개인 키는 `.env.local` 에 적습니다. **비워 두면 간이 지도**가 표시됩니다. |

### 카카오맵 키 넣기

1. [카카오 개발자 콘솔](https://developers.kakao.com) → 내 애플리케이션 → 앱 키 → **JavaScript 키** 복사
2. 같은 앱의 **[플랫폼 → Web]** 에 사이트 주소 등록 (개발: `http://localhost:5173`, 배포: 배포 주소)
3. `.env.local` 에 `VITE_KAKAO_MAP_APP_KEY=복사한키` 를 적고 `npm run dev` 를 다시 켜기

이 키는 브라우저에 그대로 보이는 값이라 숨길 수 없습니다. 대신 2번의 도메인 등록으로 다른 사이트에서 못 쓰게 막습니다.

> 왜 소셜 로그인만 따로 주소를 적나요?
> 일반 API 는 `fetch` 요청이라 `vite.config.js` 의 proxy 를 타고 8080 으로 갑니다.
> 하지만 소셜 로그인은 **브라우저가 페이지를 통째로 이동**하는 방식이라 proxy 를 타지 않습니다. 그래서 백엔드 주소를 직접 적습니다.

개인 설정은 `.env.local` 에 적어 주세요. (`.gitignore` 에 들어 있어서 깃에 안 올라갑니다)

### 백엔드 쪽에서 프론트와 맞춰야 하는 값

| 백엔드 환경 변수 | 개발 때 예시 값 | 이유 |
|---|---|---|
| `OAUTH2_SUCCESS_REDIRECT_URI` | `http://localhost:5173/oauth/callback` | 소셜 로그인 성공 → `?code=일회용코드` 를 붙여서 이 주소로 보내 줍니다 |
| `OAUTH2_FAILURE_REDIRECT_URI` | `http://localhost:5173/oauth/callback` | 소셜 로그인 실패 → `?error=실패코드` 를 붙여서 이 주소로 보내 줍니다 |
| `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY` 등 | (포트원 콘솔 값) | 결제창 정보는 프론트에 직접 적지 않고 `GET /api/config/portone` 으로 받아 옵니다 |

---

## 4. 데이터가 흐르는 길 (한 장 요약)

```
화면(pages/Home.jsx)
   └─ useApi(() => attractionApi.list('AVAILABLE'))       ← "이 데이터 줘"
        └─ api/index.js : GET /attractions?size=50&sort=NAME&reservable=true
             └─ api/http.js : fetch('/api/attractions?...')  → 스프링부트
                  ← { success, message, data }  → data 만 꺼내서 돌려줌
        └─ toAttractionSummary() 로 "화면이 쓰는 모양"으로 바꿈
```

화면 코드는 백엔드 응답 모양을 모릅니다. 백엔드 응답이 바뀌면 **`api/index.js` 의 toXxx 함수만** 고치면 됩니다.

### `http.js` 가 대신 해 주는 일

1. **응답 포장 벗기기**: 서버는 `{ success, message, data }` 로 보냅니다 → `data` 만 돌려줍니다.
2. **출입증 붙이기**: 로그인 때 받은 Access Token 을 `Authorization: Bearer 토큰` 으로 붙입니다.
    - Access Token 은 **메모리(변수)** 에만 둡니다. 새로고침하면 사라지지만, 앱이 켜질 때 Refresh Token 쿠키로 다시 받습니다.
3. **CSRF 도장**: `/api/auth/**` 와 `/api/users/signup` 에 GET 이 아닌 요청을 보낼 때는
   먼저 `GET /api/auth/csrf` 로 도장을 받아 머리글에 같이 보냅니다.
   - 머리글 이름은 서버 응답 값이 아니라 고정값 `X-XSRF-TOKEN` 을 사용합니다. (백엔드 `CookieCsrfTokenRepository` 기본값)
4. **401 이 오면 한 번만 재시도**: `POST /api/auth/refresh` 로 새 출입증을 받고 같은 요청을 다시 보냅니다.
5. **에러 문장**: 서버가 준 `message`(입력값 오류면 `data` 의 첫 번째 이유)를 화면에 그대로 보여 줍니다.
6. **요청 주소 검사**: 주소에 `..` 이나 `//` 가 섞이면 요청을 보내지 않습니다. (엉뚱한 API 를 부르는 공격 방지)

> ⚠️ **API 함수를 새로 만들 때 규칙**
> 주소에 값을 넣을 때는 꼭 감싸 주세요. 그냥 `${id}` 로 넣으면 SonarCloud 보안 경고가 납니다.
> - 숫자 id (어트랙션·예약·주문·슬롯·회원·상품): `` http.get(`/attractions/${toId(id)}`) ``
> - 글자가 섞인 값 (결제 id `pgId`): `` http.post(`/payments/${seg(pgId)}/confirm`) ``
> - 서버 응답 안의 id 로 **다시 요청하지 말고**, 이미 받은 목록에서 찾아 쓰는 걸 먼저 생각해 주세요.

### 소셜 로그인 흐름 (카카오 · 구글)

```
[카카오로 시작] 클릭
  → (백엔드) /oauth2/authorization/kakao
  → 카카오 로그인 → 백엔드가 회원 확인/가입
  → /oauth/callback?code=일회용코드
  → POST /api/auth/oauth2/exchange { code } → Access Token 받기 → 내 정보 불러오기
```
버튼 목록은 `pages/Login.jsx` 에 있습니다. id 는 백엔드 `application-oauth.yml` 의 registrationId 와 같아야 합니다.

### 결제 흐름 (포트원 V2)

```
입장권 선택 → POST /api/orders              (주문 생성, 응답에 pgId)
  → GET /api/config/portone                 (storeId, channelKey 받기)
  → PortOne.requestPayment({ paymentId: pgId, ... })   (결제창)
  → POST /api/payments/{pgId}/confirm       (서버가 포트원에 금액을 다시 확인하고 주문 확정)
```
- PC 는 보통 팝업 결제라 `Checkout.jsx` 에서 바로 승인 요청까지 합니다.
- 모바일은 결제사 페이지로 이동했다가 `/checkout/:orderId/complete` 로 돌아와서 `PaymentComplete.jsx` 가 승인 요청을 합니다.

### 루트 추천 흐름 (지도 + 내 위치)

```
/route 화면
  → GET /api/route-recommendations/attractions   (고를 수 있는 어트랙션 + 좌표)
  → 입장 처리된(IN_USE) 오늘 입장권 확인 (GET /api/tickets/me)
  → 지도(핀) 또는 목록에서 1~5개 고르기
  → [루트 추천받기] → 브라우저 위치 받기 → POST /api/route-recommendations
  → /route/result 화면 (FULL·PARTIAL 이면 예약 버튼, NONE 이면 제외 사유만)
  → [한 번에 예약하기] → POST /api/route-recommendations/{recommendationId}/reservations
  → /my/reservations
```
- **지도는 두 가지입니다.** 카카오맵 키가 있으면 `AttractionMap`(카카오맵), 없으면 `SimpleAttractionMap`(백엔드 좌표만으로 그린 간이 지도)이 표시됩니다. 바꾸는 곳은 `RouteSetup.jsx` 의 `MapView` 한 줄입니다.
- **핀을 누르는 건 미리보기**이고, 미리보기 카드의 "루트에 넣기" 버튼을 눌러야 골라집니다. (지도는 실수로 누르기 쉬워서 나눴습니다)
- **위치 권한은 버튼을 눌렀을 때만** 물어봅니다. 거부해도 지도·목록에서 고를 수 있습니다. 단, 추천 요청은 위치가 있어야 보내집니다.
- 위치는 **HTTPS(또는 localhost)** 에서만 받을 수 있습니다.
- 지도에 핀이 하나도 안 보이면 백엔드 DB 의 `attraction_locations` 가 비어 있는 것입니다. 백엔드 `docs/sql/kan-136-route-travel-data.sql` 을 실행해야 합니다. (운영 중인 어트랙션만 보입니다)

---

## 5. API

프론트가 부르는 API 목록은 [API 요약](https://github.com/attraction-final/attraction-reservation-frontend/blob/main/docs/api.md)에 정리되어 있습니다.
정확한 요청·응답 필드는 백엔드 저장소와 `src/api/index.js` 의 주석 · toXxx 함수를 기준으로 봐 주세요.

### 백엔드 이름 ↔ 화면 이름 (헷갈리기 쉬운 것)

| 구분 | 백엔드 | 화면 (`labels.js`) |
|---|---|---|
| 입장권 종류 | `ALL_DAY` | `FULL_DAY` |
| 예약 상태 | `COMPLETED` / `CANCELLED` | `USED` / `CANCELED` |

바꾸는 표는 `api/index.js` 의 `TICKET_TYPE_MAP`, `RESERVATION_STATUS_MAP` 에 있습니다.

---

## 6. 배포할 때

```bash
npm run build      # dist/ 폴더가 만들어집니다
```

### 현재 배포 구성 (Vercel)

| 항목 | 값 | 설정 위치 |
|---|---|---|
| 프론트 배포 | Vercel | Vercel 프로젝트 |
| `/api/*` 전달 | `https://api.xevbn.click/api/*` | `vercel.json` 의 `rewrites` |
| 새로고침 404 방지 | 모든 경로 → `/index.html` | `vercel.json` 의 `rewrites` |
| 소셜 로그인 주소 | `VITE_OAUTH_BASE_URL=https://api.xevbn.click` | `.env.production` |
| 카카오맵 키 | `VITE_KAKAO_MAP_APP_KEY` | **Vercel 대시보드 → Settings → Environment Variables** (`.env.production` 에는 빈 값) |

> 카카오맵 키는 깃에 올리지 않으므로 Vercel 환경 변수에 직접 넣어야 합니다.
> 또한 카카오 개발자 콘솔의 Web 플랫폼에 **배포 도메인(https://...)** 을 등록해야 배포 화면에서도 지도가 열립니다.

어디에 배포하든 아래 세 가지는 꼭 맞춰야 합니다.

1. **`/api` 요청이 백엔드로 가야 합니다.** `vite.config.js` 의 proxy 는 `npm run dev` 에서만 동작합니다. 배포 환경에서는 `/api/*` 를 백엔드 주소로 넘겨 주는 설정(예: Vercel `rewrites`, Nginx `proxy_pass`)이 따로 필요합니다.
2. **새로고침 404 막기**: `/my/tickets` 같은 주소에서 새로고침해도 `index.html` 을 돌려주도록 설정해야 합니다. (SPA 대체 경로)
3. **환경 변수**: 배포 서비스에도 `VITE_OAUTH_BASE_URL`, `VITE_KAKAO_MAP_APP_KEY` 를 넣어야 합니다. 빌드할 때 코드에 박히는 값이라, 바꾸면 **다시 빌드**해야 반영됩니다.

> ⚠️ **파일 이름 대소문자 주의**: Windows 에서는 `useGeolocation.js` 를 `Usegeolocation.js` 로 저장해도 동작하지만, 배포 서버(리눅스)에서는 "파일을 찾을 수 없다"로 빌드가 실패합니다. `import` 경로와 실제 파일 이름의 대소문자를 똑같이 맞춰 주세요.

---

## 7. 알아 두면 좋은 것 / 아직 남은 일

**백엔드에 정보·API 가 없어서 프론트가 대신 처리하는 것**
- **어트랙션 사진**: 백엔드에 사진 정보가 없어서, 이름이 같으면 `public/images/` 사진을 쓰고 없으면 공원 사진을 사용합니다. (`IMAGE_BY_NAME`)
- **키 제한**: 백엔드에 정보가 없어서 "키 제한" 필터는 지금 항상 빈 목록입니다.
- **홈 운영 현황**: 전용 API 가 없어서 어트랙션 목록으로 계산합니다. 개장 10:00 / 폐장 22:00 은 프론트에 적혀 있습니다.
- **입장권 판매 날짜**: 전용 API 가 없어서 "오늘부터 7일"을 프론트에서 만듭니다.
- **슬롯의 "내 예약 / 시간 겹침" 표시**: 내 예약 목록과 비교해서 프론트가 붙입니다.
- **슬롯 일괄 생성**: 일괄 생성 API 가 없어서 10:00~21:30 을 15분 간격으로 슬롯 추가 API 를 한 번씩 부릅니다. (정원 20명 고정)
- **관리자 예약·회원 검색**: 백엔드에 글자 검색이 없어서 최대 100건을 받아 프론트에서 거릅니다. 데이터가 많아지면 백엔드 검색 API 가 필요합니다.
- **관리자 회원 목록의 입장권 수 / 예약 수**: 응답에 없어서 비어 있습니다.

**그 밖에**
- **서비스 이름**: `src/config.js` 의 `SERVICE_NAME` 한 줄로 홈·관리자 화면 이름이 모두 바뀝니다. (지금: 놀이동선)
- **결제 수단**: 지금은 카드만 열려 있습니다. 간편결제·계좌이체는 `labels.js` 의 `PAYMENT_METHODS` 에 주석으로 막혀 있습니다. (테스트 채널이 지원하는지 먼저 확인)
- **입장 QR**: 내 입장권 화면이 입장권 `code` 로 QR 을 그리고(`qrcode.react`), 관리자 입장 처리 화면이 카메라로 읽습니다(`@zxing/browser`). 카메라도 **HTTPS(또는 localhost)** 에서만 열립니다.
- **도보 시간**: 지도·목록의 "걸어서 약 N분"은 직선거리 × 1.68 ÷ 52.8m/분으로 계산한 **추정**입니다. 백엔드 `application.yaml` 의 `route-recommendation` 값과 맞춰 두었으니, 백엔드 값을 바꾸면 `utils/geo.js` 도 같이 바꿔 주세요.
- **관리자 화면 보호**: `RequireAdmin` 은 "보기 좋게" 막는 것이고, 진짜 보안은 백엔드(`/api/admin/**` → ADMIN 권한)가 합니다.
- **사진 권한**: `public/images/` 의 어트랙션 사진은 전달받은 이미지입니다. 공개 배포(포트폴리오 등) 전에 사용 권한을 꼭 확인해 주세요.
- **폰트**: 구글 폰트(Jua, Noto Sans KR)를 인터넷에서 불러옵니다. 인터넷이 안 되면 기본 글꼴로 보입니다.
- **카카오맵 키**: 키가 없으면 간이 지도(실제 지도 그림 없이 좌표 비율대로 핀만 찍은 지도)가 표시됩니다. 키가 없을 때를 위한 대체용입니다.
