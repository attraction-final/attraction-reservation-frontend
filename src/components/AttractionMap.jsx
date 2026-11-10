import { useEffect, useRef, useState } from 'react';
import { loadKakaoMap } from '../api/Kakaomap.js';
import { hasLatLng } from '../utils/geo.js';

/**
 * 카카오맵 위에 어트랙션 핀을 찍고, 핀을 눌러 "미리보기"를 고르는 지도 부품이에요.
 *
 * 이 부품이 하는 일 (지도 SDK와 대화하는 일만 해요)
 *  1) 지도는 딱 한 번만 만들어요.
 *  2) 어트랙션 목록이 바뀌면 "추가·삭제된 핀만" 고쳐요. (diff 갱신)
 *  3) 고른 상태(selectedId, pickedIds)가 바뀌면 핀 모양만 바꿔요.
 *  4) 내 위치 점과 오차 원(정확도 반경)을 그려요.
 *
 * "무엇이 골라졌는지" 같은 상태는 부모(RouteSetup)가 들고 있어요. 이 부품은 받은 값대로 그리기만 해요.
 *
 * props
 *  - attractions : [{ id, name, zone, status, lat, lng }]
 *  - pickedIds   : 루트에 넣기로 "확정"한 id 배열 (순서 있음)
 *  - selectedId  : 지금 미리보기 중인 id (없으면 null)
 *  - onSelect(id | null) : 핀을 누르면 id, 지도 빈 곳을 누르면 null
 *  - myPosition  : { lat, lng, accuracy } 또는 null
 *  - follow      : true 면 내 위치가 바뀔 때 지도가 따라가요
 *  - onFollowChange(false) : 사용자가 지도를 끌면 따라가기를 꺼요
 *  - sheetOffset : 아래 미리보기 시트가 지도를 가리는 높이의 절반(px). 고른 핀이 시트에 가리지 않게 그만큼 위로 올려요
 *  - onShowList  : 지도를 못 불러왔을 때 "목록으로 보기" 버튼
 *  - children    : 지도 위에 띄울 버튼·안내 (부모가 넣어요)
 */

// 어트랙션 좌표가 하나도 없을 때 처음 보여 줄 가운데 (에버랜드 근처, attraction_locations 데이터 범위 안쪽)
const DEFAULT_CENTER = { lat: 37.2925, lng: 127.202 };

export default function AttractionMap({
  attractions, pickedIds, selectedId, onSelect,
  myPosition, follow, onFollowChange,
  sheetOffset = 0, onShowList, children,
}) {
  const el = useRef(null);                 // 지도가 들어갈 <div>
  const map = useRef(null);                // kakao.maps.Map 인스턴스
  const pins = useRef(new Map());          // id → { overlay, btn, attraction }
  const me = useRef(null);                 // { dot, circle } 내 위치 표시
  const fitted = useRef(false);            // 처음 한 번만 "모든 핀이 보이게" 맞추려고 기억

  // 지도 이벤트 안에서 "항상 최신 함수"를 부르려고 ref 에 넣어 둬요. (오래된 클로저 방지)
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onFollowChangeRef = useRef(onFollowChange);
  onFollowChangeRef.current = onFollowChange;

  const [sdk, setSdk] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [sdkError, setSdkError] = useState('');

  // 0) 카카오맵 SDK 불러오기
  useEffect(() => {
    let alive = true;
    loadKakaoMap()
      .then(() => alive && setSdk('ready'))
      .catch((e) => {
        if (!alive) return;
        setSdk('error');
        setSdkError(e.message);
      });
    return () => { alive = false; };
  }, []);

  // 1) 지도는 SDK가 준비되면 딱 한 번 만들어요.
  useEffect(() => {
    if (sdk !== 'ready') return undefined;
    const { kakao } = window;
    const container = el.current;
    const m = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      level: 3,
    });
    map.current = m;

    const onMapClick = () => onSelectRef.current(null);               // 빈 곳 탭 → 미리보기 닫기
    const onDragStart = () => onFollowChangeRef.current?.(false);     // 직접 끌면 따라가기 끄기
    kakao.maps.event.addListener(m, 'click', onMapClick);
    kakao.maps.event.addListener(m, 'dragstart', onDragStart);

    // 화면을 떠날 때: 핀·내 위치 표시 지우기, 이벤트 떼기
    return () => {
      kakao.maps.event.removeListener(m, 'click', onMapClick);
      kakao.maps.event.removeListener(m, 'dragstart', onDragStart);
      pins.current.forEach(({ overlay }) => overlay.setMap(null));
      pins.current.clear();
      if (me.current) {
        me.current.dot.setMap(null);
        me.current.circle.setMap(null);
        me.current = null;
      }
      map.current = null;
      fitted.current = false;
      // 개발 모드(StrictMode)에서는 이 효과가 두 번 돌아요. 같은 div 에 지도가 겹쳐 생기지 않게 비워요.
      container.innerHTML = '';
    };
  }, [sdk]);

  // 2) 어트랙션 목록이 바뀌면 "추가·삭제된 핀만" 반영해요.
  useEffect(() => {
    if (sdk !== 'ready' || !map.current) return;
    const { kakao } = window;
    const located = attractions.filter(hasLatLng);
    const ids = new Set(located.map((a) => a.id));

    // 없어진 어트랙션의 핀 지우기
    pins.current.forEach(({ overlay }, id) => {
      if (!ids.has(id)) {
        overlay.setMap(null);
        pins.current.delete(id);
      }
    });

    // 새로 생긴 어트랙션의 핀 만들기
    located.forEach((a) => {
      const existing = pins.current.get(a.id);
      if (existing) { existing.attraction = a; return; }
      const btn = createPinButton(a);
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 지도 click(=선택 해제)까지 번지지 않게
        onSelectRef.current(a.id);
      });
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(a.lat, a.lng),
        content: btn,
        yAnchor: 1,       // 핀 아래 끝이 좌표에 오게
        zIndex: 1,
        clickable: true,  // 핀을 눌러도 지도 click 이벤트가 생기지 않게
      });
      overlay.setMap(map.current);
      pins.current.set(a.id, { overlay, btn, attraction: a });
    });

    // 처음 한 번: 모든 핀이 한 화면에 들어오게 맞춰요.
    if (!fitted.current && located.length > 0) {
      const bounds = new kakao.maps.LatLngBounds();
      located.forEach((a) => bounds.extend(new kakao.maps.LatLng(a.lat, a.lng)));
      map.current.setBounds(bounds, 40, 30, 40, 30); // 위·오른쪽·아래·왼쪽 여백(px)
      fitted.current = true;
    }
  }, [sdk, attractions]);

  // 3) 미리보기·확정 상태가 바뀌면 핀 모양만 바꿔요. (지도는 다시 만들지 않아요)
  useEffect(() => {
    if (sdk !== 'ready') return;
    pins.current.forEach(({ overlay, btn, attraction }, id) => {
      const pickOrder = pickedIds.indexOf(id) + 1; // 0 이면 안 고름
      paintPin(btn, attraction, pickOrder, id === selectedId);
      overlay.setZIndex(id === selectedId ? 10 : pickOrder ? 3 : 1); // 고른 핀이 다른 핀에 가리지 않게
    });
  }, [sdk, attractions, pickedIds, selectedId]);

  // 4) 미리보기 핀이 바뀌면 그 핀으로 지도를 옮겨요. (아래 시트에 가리지 않게 살짝 위로)
  useEffect(() => {
    if (sdk !== 'ready' || !map.current || selectedId == null) return;
    const pin = pins.current.get(selectedId);
    if (!pin) return;
    onFollowChangeRef.current?.(false); // 핀을 보러 갔으니 내 위치 따라가기는 꺼요
    panToWithOffset(map.current, pin.overlay.getPosition(), sheetOffset);
  }, [sdk, selectedId, sheetOffset]);

  // 5) 내 위치 점 + 오차 원 그리기
  useEffect(() => {
    if (sdk !== 'ready' || !map.current) return;
    const { kakao } = window;

    if (!myPosition) { // 위치가 없으면(권한 거부 등) 지워요
      if (me.current) {
        me.current.dot.setMap(null);
        me.current.circle.setMap(null);
        me.current = null;
      }
      return;
    }

    const latLng = new kakao.maps.LatLng(myPosition.lat, myPosition.lng);
    if (!me.current) {
      const dotEl = document.createElement('div');
      dotEl.className = 'me-dot';
      dotEl.setAttribute('role', 'img');
      dotEl.setAttribute('aria-label', '내 위치');
      const dot = new kakao.maps.CustomOverlay({ position: latLng, content: dotEl, xAnchor: 0.5, yAnchor: 0.5, zIndex: 5 });
      const circle = new kakao.maps.Circle({
        center: latLng,
        radius: myPosition.accuracy,
        strokeWeight: 1, strokeColor: '#2F6FDB', strokeOpacity: 0.5,
        fillColor: '#2F6FDB', fillOpacity: 0.12,
      });
      dot.setMap(map.current);
      circle.setMap(map.current);
      me.current = { dot, circle };
    } else {
      me.current.dot.setPosition(latLng);
      me.current.circle.setPosition(latLng);
      me.current.circle.setRadius(myPosition.accuracy);
    }
    if (follow) map.current.panTo(latLng);
  }, [sdk, myPosition, follow]);

  if (sdk === 'error') {
    return (
      <div className="map-wrap map-fallback" role="alert">
        <span className="bold">{sdkError}</span>
        {onShowList && <button type="button" className="btn btn-outline btn-sm" onClick={onShowList}>목록으로 고르기</button>}
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={el} className="map-canvas" />
      {sdk === 'loading' && <div className="map-loading">지도를 불러오는 중이에요…</div>}
      {children}
    </div>
  );
}

// ───────── 아래는 지도 SDK 밖에서도 쓸 수 있는 작은 도우미 ─────────

// 핀 하나 = 진짜 <button>. 키보드(Tab·Enter)와 스크린리더로도 고를 수 있어요.
function createPinButton(a) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'map-pin';
  const dot = document.createElement('span');
  dot.className = 'map-pin__dot';
  const name = document.createElement('span');
  name.className = 'map-pin__name';
  name.textContent = a.name; // textContent: 이름에 특수문자가 있어도 HTML 로 해석되지 않아 안전해요
  btn.append(dot, name);
  return btn;
}

// 핀 모양 바꾸기. 색만으로 구분하지 않고 "숫자(고른 순서)·글자"도 같이 바꿔요.
function paintPin(btn, a, pickOrder, selected) {
  const closed = a.status !== 'OPERATING';
  const dot = btn.querySelector('.map-pin__dot');
  dot.textContent = closed ? '×' : pickOrder ? String(pickOrder) : '+';
  btn.classList.toggle('is-picked', pickOrder > 0);
  btn.classList.toggle('is-selected', selected);
  btn.classList.toggle('is-closed', closed);
  btn.setAttribute('aria-pressed', String(selected));
  const state = closed ? '운영 안 함' : pickOrder ? `${pickOrder}번째로 고름` : '아직 안 고름';
  btn.setAttribute('aria-label', `${a.name}, ${a.zone || ''} ${state}`.replace(/\s+/g, ' '));
}

// 좌표로 지도를 옮기되, 아래 시트 높이만큼 위로 올려서 핀이 시트 위쪽에 오게 해요.
// (지도 좌표 ↔ 화면 픽셀 변환은 카카오 MapProjection 을 써요. 실패하면 그냥 가운데로 옮겨요)
function panToWithOffset(m, latLng, offsetY) {
  if (!offsetY) { m.panTo(latLng); return; }
  try {
    const { kakao } = window;
    const projection = m.getProjection();
    const point = projection.containerPointFromCoords(latLng);
    const shifted = new kakao.maps.Point(point.x, point.y + offsetY);
    m.panTo(projection.coordsFromContainerPoint(shifted));
  } catch {
    m.panTo(latLng);
  }
}
