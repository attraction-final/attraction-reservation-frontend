import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine } from '../utils/geo.js';
import { TEST_FIXED_LOCATION } from '../config.js';

/**
 * 내 위치를 "계속" 따라가는 커스텀 훅이에요. (실시간 위치)
 * 화면(컴포넌트)은 navigator.geolocation 을 직접 부르지 않고 이 훅만 써요.
 * → 위치 로직이 한 곳에 모이고, 화면은 status 만 보고 그리면 돼요.
 *
 * 사용 예)
 *   const geo = useGeolocation();
 *   <button onClick={geo.start}>내 위치 보기</button>   // 권한 팝업은 버튼을 눌렀을 때만 떠요
 *   geo.status   : 'idle' | 'requesting' | 'tracking' | 'denied' | 'unavailable' | 'timeout'
 *   geo.position : { lat, lng, accuracy, timestamp } 또는 null
 *   geo.permission: 'granted' | 'prompt' | 'denied' | 'unknown'  (브라우저 권한 상태, 모르면 unknown)
 *
 * 한 번만 위치가 필요한 "루트 추천 요청"은 기존 api/geolocation.js 의 getCurrentLocation() 을 그대로 써요.
 * 이 훅은 지도 위 "내 위치 점"과 "가까운 순 정렬"처럼 계속 바뀌는 화면용이에요.
 */

// 상태 이름을 오타 없이 쓰려고 모아 둬요.
export const GEO_STATUS = {
    IDLE: 'idle',               // 아직 요청 안 함 → "내 위치 보기" 버튼
    REQUESTING: 'requesting',   // 권한 팝업 / 첫 위치 기다리는 중 → "확인 중…"
    TRACKING: 'tracking',       // 위치 받는 중 → 지도에 내 위치 점
    DENIED: 'denied',           // 권한 거부 → 설정에서 허용하는 방법 안내 (추적 멈춤)
    UNAVAILABLE: 'unavailable', // 지원 안 함 / 위치를 못 잡음 → 지도에서 직접 고르게 안내
    TIMEOUT: 'timeout',         // 10초 안에 못 받음 → 다시 시도 버튼
};

const WATCH_OPTIONS = {
    enableHighAccuracy: true, // GPS 사용 (정확하지만 배터리를 더 써요)
    timeout: 10000,           // 10초 안에 못 받으면 TIMEOUT
    maximumAge: 5000,         // 5초 안에 받은 값은 다시 써요
};

export function useGeolocation({ minDistanceM = 5, maxAccuracyM = 100 } = {}) {
    const [status, setStatus] = useState(GEO_STATUS.IDLE);
    const [position, setPosition] = useState(null);
    const [permission, setPermission] = useState('unknown');

    // useRef: 값이 바뀌어도 화면을 다시 그리지 않는 "메모장"이에요.
    const watchId = useRef(null);        // watchPosition 이 돌려준 번호 (끌 때 필요)
    const last = useRef(null);           // 마지막으로 화면에 반영한 위치
    const wantTracking = useRef(false);  // 사용자가 추적을 원하는지 (탭을 다시 열었을 때 재시작 여부)

    // 위치 추적 끄기 (GPS 멈춤)
    const clear = useCallback(() => {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
    }, []);

    // 실제로 위치 추적을 시작하는 함수
    const begin = useCallback(() => {
        // 테스트용 고정 위치가 켜져 있으면 GPS를 켜지 않고 그 좌표를 내 위치로 보여 줘요.
        if (TEST_FIXED_LOCATION) {
            const fixed = {
                lat: TEST_FIXED_LOCATION.latitude,
                lng: TEST_FIXED_LOCATION.longitude,
                accuracy: TEST_FIXED_LOCATION.accuracy,
                timestamp: Date.now() };
            last.current = fixed;
            setPosition(fixed);
            setStatus(GEO_STATUS.TRACKING);
            return;
        }
        // HTTPS(또는 localhost)가 아니거나 브라우저가 지원하지 않으면 위치를 받을 수 없어요.
        if (!window.isSecureContext || !('geolocation' in navigator)) {
            setStatus(GEO_STATUS.UNAVAILABLE);
            return;
        }
        clear(); // 혹시 이미 돌고 있으면 먼저 끄고 새로 시작 (두 개가 동시에 돌지 않게)
        setStatus((s) => (s === GEO_STATUS.TRACKING ? s : GEO_STATUS.REQUESTING));

        watchId.current = navigator.geolocation.watchPosition(
            ({ coords, timestamp }) => {
                // 값이 하나라도 오면 "추적 중"이에요. (아래 필터로 버려도 상태는 추적 중)
                setStatus(GEO_STATUS.TRACKING);
                const next = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, timestamp };

                // 1) 정확도 필터: 오차가 100m보다 크면 버려요. 단, 첫 값은 없는 것보다 나으니 받아요.
                if (last.current && next.accuracy > maxAccuracyM) return;
                // 2) 거리 필터: 5m도 안 움직였으면 화면을 다시 그릴 필요가 없어요. (배터리·성능 절약)
                if (last.current && haversine(last.current, next) < minDistanceM) return;

                last.current = next;
                setPosition(next);
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    // 권한 거부: 사용자가 브라우저 설정을 바꿀 때까지 추적을 멈춰요.
                    wantTracking.current = false;
                    clear();
                    setStatus(GEO_STATUS.DENIED);
                    return;
                }
                // 이미 위치를 한 번이라도 받았다면, 잠깐 못 잡은 것은 무시하고 마지막 위치를 계속 보여 줘요.
                // (건물 사이를 지날 때 상태가 깜빡이지 않게)
                if (last.current) return;
                clear();
                setStatus(err.code === err.TIMEOUT ? GEO_STATUS.TIMEOUT : GEO_STATUS.UNAVAILABLE);
            },
            WATCH_OPTIONS,
        );
    }, [clear, minDistanceM, maxAccuracyM]);

    // 화면에서 부르는 함수 2개
    const start = useCallback(() => { wantTracking.current = true; begin(); }, [begin]);
    const stop = useCallback(() => {
        wantTracking.current = false;
        clear();
        setStatus(GEO_STATUS.IDLE);
    }, [clear]);

    // 브라우저 권한 상태를 미리 알아 둬요. (Permissions API)
    // granted 면 팝업 없이 바로 추적해도 되고, denied 면 설정 안내를 먼저 보여 줄 수 있어요.
    // 일부 브라우저는 이 기능이 없어서 실패하면 'unknown' 으로 둬요.
    useEffect(() => {
        // 테스트용 고정 위치는 권한이 필요 없음 "허용됨"으로 두면 화면이 바로 내 위치를 킨다.
        if (TEST_FIXED_LOCATION) {
            setPermission('granted');
            return undefined;
        }
        let alive = true;
        let permissionStatus = null;
        const onChange = () => alive && setPermission(permissionStatus.state);
        navigator.permissions?.query({ name: 'geolocation' })
            .then((p) => {
                if (!alive) return;
                permissionStatus = p;
                setPermission(p.state);
                p.addEventListener('change', onChange);
            })
            .catch(() => {});
        return () => {
            alive = false;
            permissionStatus?.removeEventListener('change', onChange);
        };
    }, []);

    // 탭을 숨기면(다른 앱으로 가면) GPS를 멈추고, 다시 보이면 원하던 경우에만 다시 켜요.
    // 화면을 떠날 때(언마운트)는 반드시 끄기 → 안 끄면 페이지를 나가도 GPS가 계속 돌아요.
    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden) clear();
            else if (wantTracking.current) begin();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            clear();
        };
    }, [begin, clear]);

    return { status, position, permission, start, stop };
}