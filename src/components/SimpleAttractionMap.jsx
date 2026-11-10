import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistance, hasLatLng, haversine } from '../utils/geo.js';

/**
 * 카카오맵 없이, 백엔드가 준 좌표만으로 그리는 "간이 지도"예요. (임시용)
 *
 * 진짜 지도 그림(길·건물)은 없고, 하늘색 바탕에 어트랙션 핀을 "실제 위치 비율대로" 찍어요.
 * 그래서 지도 키도, 외부 인터넷 연결도 필요 없어요.
 *
 * props 는 AttractionMap.jsx 와 똑같아요. → 나중에 카카오맵으로 바꿀 때 RouteSetup 에서 부품 이름만 바꾸면 돼요.
 * (follow, onFollowChange, onShowList 는 간이 지도에서는 쓰지 않아요. 항상 전체가 한 화면에 보여서 따라갈 필요가 없어요)
 *
 * 어떻게 좌표를 화면 위치로 바꾸나요? (아주 작은 범위라서 "평평한 종이"로 봐도 오차가 거의 없어요)
 *  1) 위도·경도 차이를 미터로 바꿔요. 위도 1도 ≈ 110,540m, 경도 1도 ≈ 111,320m × cos(위도)
 *  2) 모든 핀이 화면 안에 들어가는 비율(px/m)을 구해요.
 *  3) 위쪽이 북쪽이 되도록 y 는 뒤집어요. (화면은 아래로 갈수록 y가 커지니까)
 */

const PAD = 48;                 // 가장자리 여백(px). 핀 이름표가 잘리지 않게
const SHEET_SPACE = 190;        // 미리보기 카드가 가리는 높이(px). 고른 핀이 카드 위로 오게 이만큼 피해요
const MY_POSITION_LIMIT_M = 2000; // 공원 가운데에서 이보다 멀면 내 위치는 지도에 안 그려요 (백엔드 max-start-distance 와 같은 값)

export default function SimpleAttractionMap({
  attractions, pickedIds, selectedId, onSelect, myPosition, children,
}) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // 지도 칸의 크기를 재요. 화면 크기가 바뀌면 다시 재요. (ResizeObserver)
  useEffect(() => {
    const el = box.current;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const located = useMemo(() => attractions.filter(hasLatLng), [attractions]);

  // 좌표 → 화면(px) 변환 함수 만들기. 어트랙션 목록이나 칸 크기가 바뀔 때만 다시 계산해요.
  const projection = useMemo(() => {
    if (located.length === 0 || size.w === 0) return null;
    const lats = located.map((a) => a.lat);
    const lngs = located.map((a) => a.lng);
    const center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
    const mPerLat = 110540;
    const mPerLng = 111320 * Math.cos((center.lat * Math.PI) / 180);
    const toMeters = (p) => ({ x: (p.lng - center.lng) * mPerLng, y: (p.lat - center.lat) * mPerLat });

    const pts = located.map(toMeters);
    const spanX = Math.max(...pts.map((p) => Math.abs(p.x))) * 2 || 1; // 핀이 1개면 0이 되니 1로
    const spanY = Math.max(...pts.map((p) => Math.abs(p.y))) * 2 || 1;
    const scale = Math.min((size.w - PAD * 2) / spanX, (size.h - PAD * 2) / spanY); // px per m

    return {
      center,
      scale,
      toPx: (p) => {
        const m = toMeters(p);
        return { x: size.w / 2 + m.x * scale, y: size.h / 2 - m.y * scale };
      },
    };
  }, [located, size]);

  // 고른 핀이 아래 미리보기 카드에 가리면, 지도 전체를 위로 살짝 올려요.
  let shiftY = 0;
  if (projection && selectedId != null) {
    const sel = located.find((a) => a.id === selectedId);
    if (sel) {
      const limit = size.h - SHEET_SPACE;      // 카드 위쪽 경계
      const y = projection.toPx(sel).y;
      if (y > limit) shiftY = limit - y;       // 음수 = 위로 이동
    }
  }

  // 내 위치: 공원에서 너무 멀면(예: 집에서 테스트) 그리지 않고 안내만 해요.
  const meDistance = projection && myPosition ? haversine(projection.center, myPosition) : null;
  const showMe = meDistance != null && meDistance <= MY_POSITION_LIMIT_M;
  const me = showMe ? projection.toPx(myPosition) : null;

  return (
    <div className="map-wrap">
      {/* 빈 곳을 누르면 미리보기 닫기 */}
      <div ref={box} className="map-canvas simple-map" onClick={() => onSelect(null)}>
        {projection && (
          <div className="simple-map__layer" style={{ transform: `translateY(${shiftY}px)` }}>
            {/* 내 위치 오차 원 + 점 (핀보다 아래에 깔려요) */}
            {me && (
              <>
                <div className="simple-map__accuracy" style={{
                  left: me.x, top: me.y,
                  width: myPosition.accuracy * projection.scale * 2,
                  height: myPosition.accuracy * projection.scale * 2,
                }} />
                <div className="me-dot simple-map__me" role="img" aria-label="내 위치" style={{ left: me.x, top: me.y }} />
              </>
            )}

            {located.map((a) => {
              const { x, y } = projection.toPx(a);
              const pickOrder = pickedIds.indexOf(a.id) + 1;
              const selected = a.id === selectedId;
              const closed = a.status !== 'OPERATING';
              const state = closed ? '운영 안 함' : pickOrder ? `${pickOrder}번째로 고름` : '아직 안 고름';
              return (
                // 바깥 div: 위치 잡기(핀 아래 끝이 좌표), 안쪽 button: 모양(커지기 효과)
                <div key={a.id} className="simple-map__pin-pos" style={{ left: x, top: y, zIndex: selected ? 10 : pickOrder ? 3 : 1 }}>
                  <button type="button"
                    className={`map-pin${pickOrder ? ' is-picked' : ''}${selected ? ' is-selected' : ''}${closed ? ' is-closed' : ''}`}
                    aria-pressed={selected}
                    aria-label={`${a.name}, ${a.zone || ''} ${state}`.replace(/\s+/g, ' ')}
                    onClick={(e) => { e.stopPropagation(); onSelect(a.id); }}>
                    <span className="map-pin__dot">{closed ? '×' : pickOrder || '+'}</span>
                    <span className="map-pin__name">{a.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {projection && <ScaleBar scale={projection.scale} />}
        <span className="simple-map__north" aria-hidden="true">N ↑</span>
      </div>

      {meDistance != null && !showMe && (
        <div className="simple-map__far" role="status">
          내 위치가 공원에서 약 {formatDistance(meDistance)} 떨어져 있어 지도에는 표시하지 않아요.
        </div>
      )}
      {children}
    </div>
  );
}

// 축척 막대: "이 막대 길이 = 100m" 처럼 실제 거리를 알려 줘요.
// 화면 폭에 맞게 50·100·200·500m 중 60~120px 근처가 되는 값을 골라요.
function ScaleBar({ scale }) {
  const meters = [50, 100, 200, 500, 1000].find((m) => m * scale >= 60) ?? 1000;
  return (
    <div className="simple-map__scale" aria-hidden="true">
      <span style={{ width: meters * scale }} />
      {formatDistance(meters)}
    </div>
  );
}
