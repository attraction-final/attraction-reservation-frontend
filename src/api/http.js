import { API_BASE } from '../config.js';
import { ApiError } from './ApiError.js';

/**
 * 모든 API 요청이 지나가는 "단 하나의 문"입니다.
 *
 * 우리 스프링부트 서버의 약속 3가지를 여기서 한꺼번에 처리해요.
 *  1) 응답 포장지 벗기기 : 서버는 { success, message, data } 로 감싸서 보내요 → data 만 꺼내요.
 *  2) 출입증(Access Token) : 로그인하면 받은 토큰을 "Authorization: Bearer 토큰" 머리글에 붙여요.
 *  3) CSRF 도장       : /api/auth/** 와 /api/users/signup 에 POST 할 때는
 *                        먼저 /api/auth/csrf 에서 도장(토큰)을 받아 머리글에 같이 보내요.
 *
 * 그리고 401(출입증 만료)이 오면 /api/auth/refresh 로 새 출입증을 한 번 받아서 다시 시도해요.
 */

// ───────── 출입증(Access Token) 보관함 ─────────
// 메모리(변수)에만 둡니다. 새로고침하면 사라지지만,
// Refresh Token 쿠키가 있으니 앱이 켜질 때 refresh 로 다시 받아요. (AuthContext.jsx 참고)
let accessToken = null;
export function setAccessToken(token) { accessToken = token; }
export function clearAccessToken() { accessToken = null; }

// ───────── CSRF 도장이 필요한 주소인지 판단 ─────────
// SecurityConfig.java 의 csrfProtectedRequests 와 같은 규칙이에요.
function needsCsrf(method, path) {
  if (method === 'GET') return false;
  return path.startsWith('/auth/') || path === '/users/signup';
}

// CSRF 도장의 머리글 이름. 백엔드 SecurityConfig 의 CookieCsrfTokenRepository 기본값과 같아요.
// 서버가 알려 주는 이름을 그대로 머리글 키로 쓰지 않고, 이 고정값만 써요.
// (아무 이름이나 키로 쓰면 Authorization 같은 머리글을 덮어쓸 수 있고, 보안 검사 도구도 경고해요)
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

// CSRF 도장 받기: GET /api/auth/csrf → { headerName, token }
// 서버가 준 headerName 은 "우리가 아는 이름이 맞는지" 확인하는 데만 쓰고, 토큰 문자열만 돌려줘요.
async function fetchCsrf() {
  const res = await fetch(API_BASE + '/auth/csrf', { credentials: 'include' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new ApiError('CSRF 토큰을 받지 못했어요.', res.status);

  const { headerName, token } = json.data;
  if (headerName !== CSRF_HEADER_NAME || typeof token !== 'string' || token === '') {
    throw new ApiError('CSRF 토큰 형식이 올바르지 않아요.', res.status);
  }
  return token;
}

// ───────── 요청 주소 안전 검사 ─────────
// path 에는 주소창에서 온 값(예: /attractions/:id 의 id)이 섞여 들어와요.
// 누군가 id 자리에 "../users/me" 같은 값을 넣은 링크를 보내면, 브라우저가 경로를 정리하면서
// 우리 출입증(Authorization)을 단 채로 "엉뚱한 API"를 부르게 될 수 있어요. (Client-Side Request Forgery)
// 그래서 서버로 보내기 전에, 우리 API 경로 모양이 맞는지 한 곳에서 검사해요.
//  - '/' 로 시작해야 해요. ('//다른사이트' 처럼 시작하면 다른 주소로 갈 수 있어서 막아요)
//  - 역슬래시(\), 공백·제어문자는 안 돼요.
//  - 경로 조각 중에 '.' 이나 '..' 이 있으면 안 돼요. (%2e%2e 처럼 인코딩해서 숨긴 것도 풀어서 검사해요)
const SAFE_PATH = /^\/(?!\/)[^\\\s]*$/;
function assertSafePath(path) {
  if (typeof path !== 'string') throw new ApiError('잘못된 요청 주소예요.', 400);
  const [pathname] = path.split('?'); // 뒤의 ?쿼리 는 경로 조각이 아니라서 빼고 봐요
  const segments = pathname.split('/').map((seg) => {
    try { return decodeURIComponent(seg); } catch { return null; } // 잘못된 % 인코딩도 막아요
  });
  const hasDotSegment = segments.some((seg) => seg === null || seg === '.' || seg === '..' || seg.includes('/'));
  if (!SAFE_PATH.test(path) || hasDotSegment) {
    throw new ApiError('잘못된 요청 주소예요.', 400);
  }
}

// ───────── 실제로 서버에 한 번 요청하기 ─────────
async function send(method, path, body) {
  assertSafePath(path);
  // Headers 객체: 일반 객체({})와 달리 키를 내부 목록에 따로 저장해서, 어떤 이름이 와도 객체 구조가 바뀌지 않아요.
  // fetch 가 원래 받는 형식이라 동작은 똑같아요.
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (needsCsrf(method, path)) {
    headers.set(CSRF_HEADER_NAME, await fetchCsrf()); // 머리글 이름은 서버 값이 아니라 고정값
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include', // 쿠키(refreshToken, XSRF-TOKEN)를 같이 보내기
  });

  if (res.status === 204) return { res, json: null };
  const json = await res.json().catch(() => null);
  return { res, json };
}

// ───────── 출입증 재발급 (동시에 여러 번 부르지 않도록 하나로 묶어요) ─────────
let refreshing = null;
export function tryRefresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const { res, json } = await send('POST', '/auth/refresh');
      if (!res.ok || !json?.data?.accessToken) {
        clearAccessToken();
        return false;
      }
      setAccessToken(json.data.accessToken);
      return true;
    })()
        .catch(() => { clearAccessToken(); return false; })
        .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// 서버 에러 응답 → 화면에 보여 줄 문장 만들기
// 입력값 검증 실패면 data 에 { 필드명: '이유' } 가 들어 있어서 첫 번째 이유를 보여 줘요.
function errorMessage(json, status) {
  const fieldErrors = json?.data && typeof json.data === 'object' ? Object.values(json.data) : [];
  if (fieldErrors.length > 0 && typeof fieldErrors[0] === 'string') return fieldErrors[0];
  return json?.message || `요청에 실패했어요 (${status})`;
}

export async function request(method, path, body) {
  let { res, json } = await send(method, path, body);

  // 401 = 출입증이 없거나 만료됨 → 재발급 후 딱 한 번만 다시 시도
  const isAuthPath = path.startsWith('/auth/');
  if (res.status === 401 && !isAuthPath) {
    const ok = await tryRefresh();
    if (ok) ({ res, json } = await send(method, path, body));
  }

  if (!res.ok) throw new ApiError(errorMessage(json, res.status), res.status);
  return json?.data ?? null; // 포장지 벗기고 알맹이(data)만 돌려줘요
}

// 진짜 스프링부트 서버로 가는 요청
export const http = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};

// ───────── 주소 조각 안전하게 만들기 ─────────
// API 경로에 id 같은 값을 넣을 때는 꼭 seg() 로 감싸요.
//   http.get(`/attractions/${seg(id)}`)
//  - encodeURIComponent: '/', '?', '#' 같은 특수문자를 %2F 처럼 바꿔서, 값이 경로를 쪼개거나 바꾸지 못하게 해요.
//  - '.', '..', 빈 값은 encodeURIComponent 로도 안 바뀌어서(점은 그대로 남아요) 따로 막아요.
export function seg(value) {
  const s = String(value ?? '');
  if (s === '' || s === '.' || s === '..') throw new ApiError('잘못된 요청 주소예요.', 400);
  return encodeURIComponent(s);
}

// { date: '2026-10-24', q: '' } → "?date=2026-10-24" (빈 값은 빼고 만들어 줘요)
export function toQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}