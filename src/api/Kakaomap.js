import { KAKAO_MAP_APP_KEY } from '../config.js';

/**
 * 카카오맵 SDK(지도 프로그램)를 "딱 한 번만" 불러오는 함수예요.
 *
 * 사용 예)
 *   await loadKakaoMap();          // 처음 부르면 스크립트를 내려받고, 두 번째부터는 바로 끝나요
 *   new window.kakao.maps.Map(...)
 *
 * 왜 이렇게 하나요?
 *  - index.html 에 <script> 를 박아 두면 지도를 안 쓰는 화면에서도 매번 내려받아요.
 *  - 그래서 지도가 필요한 화면에 들어왔을 때만 불러와요.
 *  - autoload=false: 스크립트만 먼저 받고, 실제 준비는 kakao.maps.load(콜백) 안에서 끝내는 방식이에요.
 *    (이렇게 해야 "다 준비된 뒤"를 정확히 알 수 있어요)
 */

const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';
const LOAD_TIMEOUT_MS = 10000; // 10초 안에 준비가 안 되면 실패로 봐요 (키·도메인 오류일 때 무한 대기 방지)

let loadingPromise = null; // 여러 화면이 동시에 불러도 스크립트는 한 번만 붙이려고 기억해 둬요

export function loadKakaoMap() {
    // 이미 준비돼 있으면 바로 끝
    if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao);
    // 불러오는 중이면 그 약속(Promise)을 같이 기다려요
    if (loadingPromise) return loadingPromise;

    if (!KAKAO_MAP_APP_KEY) {
        return Promise.reject(new Error('지도 키가 설정되지 않아 지도를 열 수 없어요. 목록에서 골라 주세요.'));
    }

    loadingPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${SDK_URL}?appkey=${encodeURIComponent(KAKAO_MAP_APP_KEY)}&autoload=false`;
        script.async = true;

        const fail = () => {
            script.remove();
            loadingPromise = null; // 다음에 다시 시도할 수 있게 비워요
            reject(new Error('지도를 불러오지 못했어요. 목록에서 골라 주세요.'));
        };
        const timer = setTimeout(fail, LOAD_TIMEOUT_MS);

        script.onload = () => {
            if (!window.kakao?.maps?.load) { clearTimeout(timer); fail(); return; }
            window.kakao.maps.load(() => {
                clearTimeout(timer);
                resolve(window.kakao);
            });
        };
        script.onerror = () => { clearTimeout(timer); fail(); };
        document.head.appendChild(script);
    });
    return loadingPromise;
}