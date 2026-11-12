// 앱 전체에서 쓰는 설정값을 한곳에 모아 둔 파일입니다.

// 서비스 이름: 여기 한 줄만 바꾸면 홈·관리자 화면의 이름이 모두 바뀝니다.
export const SERVICE_NAME = '놀이동선';

// 스프링부트 API 주소의 앞부분. 모든 요청은 /api/... 로 갑니다.
export const API_BASE = '/api';

// 소셜 로그인 시작 주소의 앞부분 (.env 파일에서 정해요)
// 소셜 로그인은 fetch 요청이 아니라 "브라우저가 페이지를 통째로 이동"하는 방식이라 /api 프록시를 안 타요.
//  - 개발: 프론트(5173)와 백엔드(8080)가 따로 떠 있어서 백엔드 주소를 직접 적어요.
//  - 배포: 같은 서버에서 프론트와 백엔드를 같이 내보내면 빈 값('')이면 돼요.
export const OAUTH_BASE = import.meta.env.VITE_OAUTH_BASE_URL ?? '';

// 카카오맵 JavaScript 키 (.env 파일에서 정해요)
// 카카오 개발자 콘솔 → 내 애플리케이션 → 앱 키 → "JavaScript 키" 를 넣어요.
// 이 키는 브라우저에 그대로 보이는 값이라 숨길 수 없어요. 대신 콘솔의 [플랫폼 → Web] 에 사이트 도메인을 꼭 등록해서
// 등록한 주소에서만 지도가 열리게 막아요. (예: http://localhost:5173, 배포 주소)
export const KAKAO_MAP_APP_KEY = import.meta.env.VITE_KAKAO_MAP_APP_KEY ?? '';


// 테스트용 고정 위치 (.env 또는 Vercel 환경변수 VITE_TEST_FIXED_LOCATION="위도,경도")
// 값이 있으면 브라우저 위치 대신 이 좌표를 내 위치로 쓴다 공원 밖에서 루트 추천을 테스트할 때만 킨다
//  - Vercel 에서는 Preview 환경에만 넣는다 Production(운영 주소)에는 넣지 않는다
//  - 값이 없거나 형식이 틀리면 null → 평소처럼 실제 위치를 쓴다
export const TEST_FIXED_LOCATION = parseFixedLocation(import.meta.env.VITE_TEST_FIXED_LOCATION);

function parseFixedLocation(value) {
    if (!value) return null;
    const [latitude, longitude] = String(value).split(',').map((v) => Number(v.trim()));
    const valid = Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    return valid ? { latitude, longitude, accuracy: 10 } : null;
}