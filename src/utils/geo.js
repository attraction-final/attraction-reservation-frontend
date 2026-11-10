// 위치(위도·경도) 계산을 모아 둔 작은 도구 상자예요.
// 화면 어디서든 import 해서 써요. 브라우저 기능(navigator)은 쓰지 않아서 테스트하기 쉬워요.

// 두 좌표 사이의 "직선 거리"(m)를 구해요. (하버사인 공식: 지구를 공으로 보고 계산)
// 예) haversine({ lat: 37.2923, lng: 127.1995 }, { lat: 37.2929, lng: 127.2024 }) → 약 265
export function haversine(a, b) {
    const R = 6371e3;            // 지구 반지름(m)
    const rad = Math.PI / 180;   // 도(°) → 라디안 변환용
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// 걸어서 걸리는 시간 "추정"에 쓰는 값이에요.
// 백엔드 application.yaml 의 route-recommendation 설정과 같은 숫자를 써서, 추천 결과의 첫 구간 추정과 크게 어긋나지 않게 해요.
//  - DETOUR_FACTOR      : 실제로 걷는 길 ÷ 직선 거리 (길이 구불구불하니까 직선보다 길어요)
//  - WALK_M_PER_MINUTE  : 1분에 걷는 거리(m)
// 백엔드 설정을 바꾸면 여기도 같이 바꿔 주세요.
const DETOUR_FACTOR = 1.68;
const WALK_M_PER_MINUTE = 52.8;

// 직선 거리(m) → 걸어서 약 몇 분인지 (최소 1분)
export function estimateWalkMinutes(straightM) {
    return Math.max(1, Math.ceil((straightM * DETOUR_FACTOR) / WALK_M_PER_MINUTE));
}

// 1234 → "1.2km", 85.4 → "85m"
export function formatDistance(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

// 좌표가 제대로 들어 있는지 (백엔드가 아직 좌표를 안 주면 null 이에요)
export function hasLatLng(p) {
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
}