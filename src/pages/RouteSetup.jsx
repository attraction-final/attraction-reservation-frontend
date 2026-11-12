import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import AttractionMap from '../components/AttractionMap.jsx';
import SimpleAttractionMap from '../components/SimpleAttractionMap.jsx';
import AttractionPreviewSheet from '../components/AttractionPreviewSheet.jsx';
import { BackHeader, Empty, Loading } from '../components/ui.jsx';
import { KAKAO_MAP_APP_KEY } from '../config.js';
import { useApi } from '../hooks/useApi.js';
import { GEO_STATUS, useGeolocation } from '../hooks/useGeolocation.js';
import { ROUTE_CLOSE_TIME, ROUTE_MAX_PICK, ROUTE_MIN_PICK, routeApi } from '../api/index.js';
import { getCurrentLocation } from '../api/geolocation.js';
import { estimateWalkMinutes, formatDistance, hasLatLng, haversine } from '../utils/geo.js';
import { useAuth } from '../context/AuthContext.jsx';

/*
 * 루트 추천 화면
 * 입장 처리된 오늘 입장권으로, 어트랙션을 1~5개 고르면 "지금 위치 + 지금 시각"에서 출발해
 * 폐장(22:00) 전까지 탈 수 있는 방문 순서와 슬롯을 추천받아요. (예약은 결과 화면에서 한 번에 해요)
 * 어트랙션은 "지도"에서 핀을 눌러 고르거나, "목록"에서 체크해서 골라요. 두 화면은 같은 picked 를 같이 써요.
 *
 * 한 함수가 너무 많은 일을 하면 읽기 어려워서, 역할별로 나눴어요.
 *  - RouteSetup        : 상태(기억)를 들고, 아래 부품들을 조립해요
 *  - useRouteSubmit    : "루트 추천받기" 버튼을 눌렀을 때의 일 (위치 받기 → 서버 요청 → 결과 화면)
 *  - TicketBox         : 추천에 쓸 입장권 (IN_USE + 오늘) 보여 주기·고르기
 *  - useAutoStartGeo   : 이미 위치 권한을 허용한 사람이면 바로 내 위치 켜기
 *  - MapPicker / RideList / PickedChips / SubmitBar : 화면 조각
 */

// 아래 미리보기 시트가 지도를 가리는 높이의 절반쯤(px). 고른 핀이 시트 위에 보이게 지도를 이만큼 올려요.
const SHEET_OFFSET_PX = 80;

// 서버는 위치 오차가 이 값(m) 이상이면 추천을 거절해요. (백엔드 RouteRecommendationProperties.accuracyLimitMeters 기본값 100)
// ⚠️ 서버 설정값을 바꾸면 여기도 같이 바꿔야 해요.
const ACCURACY_LIMIT_M = 100;

// 지도 고르기: 카카오 키가 있으면 카카오맵, 없으면 백엔드 좌표만으로 그리는 간이 지도(임시)를 써요.
// 두 부품은 props 가 같아서 이 한 줄로 바꿔 끼울 수 있어요.
const USE_KAKAO = Boolean(KAKAO_MAP_APP_KEY);
const MapView = USE_KAKAO ? AttractionMap : SimpleAttractionMap;

export default function RouteSetup() {
  const { user } = useAuth();
  const rides = useApi(() => (user ? routeApi.recommendableAttractions() : Promise.resolve([])), [user]);
  // 추천에 쓸 수 있는 입장권: 입장 처리됨(IN_USE) + 방문일 오늘
  const tickets = useApi(() => (user ? routeApi.todayTickets() : Promise.resolve([])), [user]);
  const [ticketId, setTicketId] = useState('');
  useEffect(() => {
    if (tickets.data?.length) setTicketId((prev) => prev || tickets.data[0].id);
  }, [tickets.data]);

  const [picked, setPicked] = useState([]);          // 루트에 넣기로 "확정"한 어트랙션 id (고른 순서대로)
  const [selectedId, setSelectedId] = useState(null); // 지도에서 "미리보기" 중인 어트랙션 id (확정 아님)
  const [view, setView] = useState('map');           // 'map' | 'list'
  const [follow, setFollow] = useState(true);        // 지도가 내 위치를 따라가는지
  const [sortNear, setSortNear] = useState(false);   // 목록을 가까운 순으로 볼지

  // 실시간 내 위치 (지도 위 점, 거리 표시용). 버튼을 누르기 전에는 권한을 묻지 않아요.
  const geo = useGeolocation();
  useAutoStartGeo(geo);

  const { submit, error, setError, submitting, locating, errorRef } = useRouteSubmit(picked, ticketId);
  const list = useSortedRides(rides.data, geo.position, sortNear);

  if (!user) {
    return (
      <div className="screen">
        <BackHeader title="루트 추천" to="/" />
        <Empty>루트 추천은 로그인 후 이용할 수 있어요.<br /><Link to="/login">로그인하러 가기</Link></Empty>
      </div>
    );
  }
  if (rides.loading || tickets.loading) return <div className="screen"><BackHeader title="루트 추천" to="/" /><Loading /></div>;

  // 고르기·빼기. 규칙은 togglePick(아래)에 있고, 여기서는 결과를 상태에 넣기만 해요.
  const toggle = (id) => {
    const result = togglePick(picked, id);
    setError(result.error);
    setPicked(result.next);
  };

  const showList = () => { setView('list'); setSelectedId(null); };

  return (
    <div className="screen">
      <BackHeader title="루트 추천" to="/" />
      <div className="screen-body pad stack gap-12">
        <div className="row gap-12" style={{ background: 'var(--pink-soft)', borderRadius: 18, padding: '10px 14px', flexShrink: 0 }}>
          <span className="icon-circle" style={{ width: 36, height: 36, borderRadius: 12, background: '#fff', color: 'var(--pink-dark)' }}><Icon name="map" size={20} /></span>
          <span className="small" style={{ color: '#8C2049', lineHeight: 1.5 }}>
            지금 위치에서 출발해 폐장({ROUTE_CLOSE_TIME})까지 탈 수 있는 순서를 추천해요. 위치는 내 위치 보기와 이번 추천에만 쓰고 저장하지 않아요.
          </span>
        </div>

        <TicketBox tickets={tickets} ticketId={ticketId} onChange={setTicketId} />

        <LocationBox geo={geo} />

        <ViewTabs view={view} onMap={() => setView('map')} onList={showList} />

        <div className="stack gap-8" style={{ flexShrink: 0 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 className="display" style={{ fontSize: 18 }}>방문할 어트랙션</h2>
            <span className="small bold" style={{ color: 'var(--blue-ink)' }}>{picked.length}/{ROUTE_MAX_PICK}개 선택 · 최대 {ROUTE_MAX_PICK}개</span>
          </div>
          {rides.error && <span className="error-text" role="alert">{rides.error.message}</span>}
          {!rides.error && list.length === 0 && (
            <span className="small muted">지금은 추천할 수 있는 어트랙션이 없어요. 잠시 후 다시 확인해 주세요.</span>
          )}
          <PickedChips picked={picked} list={list} onRemove={toggle} />
        </div>

        {view === 'map' ? (
          <MapPicker list={list} picked={picked} selectedId={selectedId} onSelect={setSelectedId}
            geo={geo} follow={follow} onFollowChange={setFollow} onToggle={toggle} onShowList={showList} />
        ) : (
          <RideList list={list} picked={picked} onToggle={toggle} geo={geo}
            sortNear={sortNear} onSortNear={setSortNear} />
        )}

        {error && (
          // 목록 아래에 있어서 실패하면 이 영역이 보이도록 스크롤해요.
          <div ref={errorRef} className="stack gap-8" style={{ flexShrink: 0 }}>
            <span className="error-text" role="alert">{error.message}</span>
            <ErrorAction action={error.action} onRetry={submit} />
          </div>
        )}
      </div>

      <SubmitBar onSubmit={submit} disabled={submitting || !ticketId || picked.length < ROUTE_MIN_PICK}
        submitting={submitting} locating={locating} />
    </div>
  );
}

// ───────── 상태·동작 (화면 그림과 상관없는 규칙) ─────────

// 고르기·빼기 규칙. 화면 상태를 직접 바꾸지 않고 "다음 상태"만 계산해서 돌려줘요. (테스트하기 쉬워요)
function togglePick(picked, id) {
  if (picked.includes(id)) return { next: picked.filter((x) => x !== id), error: '' };
  if (picked.length >= ROUTE_MAX_PICK) {
    return { next: picked, error: `어트랙션은 ${ROUTE_MAX_PICK}개까지 고를 수 있어요.` };
  }
  return { next: [...picked, id], error: '' };
}

// 이미 위치 권한을 허용한 사람은 팝업이 뜨지 않으니 바로 내 위치를 보여 줘요. (한 번만)
function useAutoStartGeo(geo) {
  const autoStarted = useRef(false);
  const { permission, start } = geo;
  useEffect(() => {
    if (permission === 'granted' && !autoStarted.current) {
      autoStarted.current = true;
      start();
    }
  }, [permission, start]);
}

// 목록에 보여 줄 순서: 가까운 순을 켰고 내 위치가 있으면 거리순, 아니면 서버 순서 그대로
function useSortedRides(rides, position, sortNear) {
  return useMemo(() => {
    const items = (rides || []).map((a) => ({
      ...a,
      distanceM: position && hasLatLng(a) ? haversine(position, a) : null,
    }));
    if (sortNear && position) {
      items.sort((x, y) => (x.distanceM ?? Infinity) - (y.distanceM ?? Infinity));
    }
    return items;
  }, [rides, position, sortNear]);
}

// 서버 오류 → 안내 문장 옆에 붙일 "다음 행동" 버튼 종류
// 서버 실패 응답에는 오류 코드가 없어서(message 만 있어요), HTTP 상태 + 메시지 일부로 구분해요.
// ⚠️ 서버 문구가 바뀌면 여기도 같이 바꿔야 해요.
function errorActionOf(e) {
  if (e.status === 409 && e.message?.includes('이용 예정인 어트랙션 예약')) return 'MY_RESERVATIONS';
  if (e.status === 409) return 'MY_TICKETS';                      // 입장 처리 전(UNUSED)·사용 완료·환불된 입장권
  if (e.status === 400 && e.message?.includes('정확도')) return 'RETRY_LOCATION';
  if (e.status === 404) return 'RELOAD';                           // 그사이 삭제된 어트랙션 등
  return null;
}

// "루트 추천받기" 버튼을 눌렀을 때 하는 일
function useRouteSubmit(picked, ticketId) {
  const navigate = useNavigate();
  const [error, setErrorState] = useState(null);       // { message, action } | null
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);     // 추천 요청 직전에 현재 위치를 받는 중
  const errorRef = useRef(null);

  // 화면 쪽(togglePick 등)에서는 문장만 넘기면 돼요. 빈 문장이면 오류를 지워요.
  const setError = useCallback((message, action = null) => {
    setErrorState(message ? { message, action } : null);
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const submit = useCallback(async () => {
    setError('');
    if (!ticketId) {
      setError('입장 처리된 오늘 입장권이 있어야 루트를 추천받을 수 있어요.', 'MY_TICKETS');
      return;
    }
    if (picked.length < ROUTE_MIN_PICK || picked.length > ROUTE_MAX_PICK) {
      setError(`어트랙션을 ${ROUTE_MIN_PICK}~${ROUTE_MAX_PICK}개 골라 주세요.`);
      return;
    }
    setSubmitting(true);
    try {
      // 버튼을 누른 이때 위치를 받아요. (화면에 들어오자마자 권한 팝업이 뜨지 않게)
      // 위치를 못 받으면 여기서 멈춰서 서버 요청은 보내지 않아요.
      setLocating(true);
      const position = await getCurrentLocation().finally(() => setLocating(false));
      const result = await routeApi.recommend({ ticketId, position, attractionIds: picked });
      // FULL / PARTIAL / NONE 모두 "성공"이에요. 결과 화면이 resultType 으로 나눠서 보여 줘요.
      navigate('/route/result', { state: { result } });
    } catch (e) {
      // 위치 실패(권한 거부 등)는 getCurrentLocation 이, 서버 거절은 서버가 만든 안내 문장을 그대로 보여 줘요.
      setError(e.message, errorActionOf(e));
    } finally {
      setSubmitting(false);
    }
  }, [picked, ticketId, navigate, setError]);

  return { submit, error, setError, submitting, locating, errorRef };
}

// ───────── 문구·모양 계산 (if 문으로 풀어서 한눈에 읽히게) ─────────

// 지도 "내 위치" 버튼 글자
function locationButtonLabel(status, follow) {
  if (status === GEO_STATUS.REQUESTING) return '확인 중…';
  if (status !== GEO_STATUS.TRACKING) return '내 위치 보기';
  if (!USE_KAKAO) return '내 위치 표시 중'; // 간이 지도는 항상 공원 전체가 보여서 "따라가기"가 없어요
  if (follow) return '내 위치 따라가는 중';
  return '내 위치로';
}

// 아래 "루트 추천받기" 버튼 글자
function submitLabel(locating, submitting) {
  if (locating) return '현재 위치 확인 중…';
  if (submitting) return '추천 중…';
  return '루트 추천받기';
}

// 목록 한 줄의 모양: 운영 안 함 / 고름 / 안 고름
function rideItemStyle(closed, on) {
  if (closed) return { background: '#F1F3F7', border: '1.5px dashed #C9D4E3', opacity: 0.75 };
  if (on) return { background: '#F2F7FF', border: '2px solid var(--blue)' };
  return { background: '#fff', border: '2px solid #fff', boxShadow: 'var(--shadow)' };
}

// 위치 상태별 안내 문구. 문제가 없으면 빈 문자열이라 아무것도 안 보여요.
function geoMessage(status) {
  switch (status) {
    case GEO_STATUS.DENIED:
      return '위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용하면 내 위치가 보여요. 지도에서 바로 골라도 돼요.';
    case GEO_STATUS.TIMEOUT:
      return '위치를 받는 데 시간이 오래 걸려요.';
    case GEO_STATUS.UNAVAILABLE:
      return '지금은 위치를 확인할 수 없어요. 지도에서 직접 골라 주세요.';
    default:
      return '';
  }
}

// "현재 위치" 영역의 상태 글자
function locationStatusText(status, position) {
  if (status === GEO_STATUS.REQUESTING) return '측정 중…';
  if (status === GEO_STATUS.TRACKING && position) return '측정 완료';
  if (status === GEO_STATUS.DENIED) return '권한 꺼짐';
  if (status === GEO_STATUS.TIMEOUT) return '시간 초과';
  if (status === GEO_STATUS.UNAVAILABLE) return '측정 실패';
  return '측정 전';
}

// ───────── 화면 조각 ─────────

// 현재 위치 영역: 측정 상태 · 정확도(오차 반경) · 다시 측정 버튼
// 여기 보이는 값은 "미리 보기"예요. 실제 추천 요청 때는 버튼을 누른 순간 위치를 한 번 더 새로 재서 보내요.
function LocationBox({ geo }) {
  const { status, position, start } = geo;
  const measuring = status === GEO_STATUS.REQUESTING;
  const accuracyM = position ? Math.round(position.accuracy) : null;
  const tooInaccurate = accuracyM != null && accuracyM >= ACCURACY_LIMIT_M;
  const problem = geoMessage(status); // 권한 꺼짐·시간 초과·실패일 때만 문장이 있어요

  return (
    <section className="card stack gap-8" aria-labelledby="route-location-title"
      style={{ borderRadius: 18, padding: '12px 14px', flexShrink: 0 }}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <h2 id="route-location-title" className="row gap-4 small bold" style={{ margin: 0 }}>
          <Icon name="locate" size={16} strokeWidth={2.2} />현재 위치
        </h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={start} disabled={measuring}>
          {position ? '다시 측정' : '위치 측정'}
        </button>
      </div>
      {/* <output>: 상태가 바뀌면 스크린리더가 읽어 줘요 */}
      <output className="small" style={{ color: 'var(--blue-ink)' }}>
        <span className="bold">{locationStatusText(status, position)}</span>
        {accuracyM != null && <span> · 정확도 약 ±{accuracyM}m</span>}
      </output>
      {tooInaccurate && (
        <span className="small" style={{ color: 'var(--orange-ink)' }}>
          오차가 {ACCURACY_LIMIT_M}m 이상이면 추천을 받을 수 없어요. 건물 밖이나 하늘이 트인 곳에서 다시 측정해 주세요.
        </span>
      )}
      {problem && <span className="small muted">{problem}</span>}
      <span className="small muted">루트 추천받기를 누를 때 위치를 한 번 더 새로 측정해서 보내요.</span>
    </section>
  );
}

function ViewTabs({ view, onMap, onList }) {
  return (
    <div className="segment" role="tablist" aria-label="고르는 방법" style={{ flexShrink: 0 }}>
      <button type="button" role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={onMap}>지도로 고르기</button>
      <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={onList}>목록으로 고르기</button>
    </div>
  );
}

// 고른 순서 요약: 지도에서도 무엇을 골랐는지 한눈에 보이고, ×로 바로 뺄 수 있어요
function PickedChips({ picked, list, onRemove }) {
  if (picked.length === 0) return null;
  const nameOf = (id) => list.find((a) => a.id === id)?.name ?? `어트랙션 ${id}`;
  return (
    <div className="picked-row" aria-label="고른 어트랙션">
      {picked.map((id, i) => (
        <button key={id} type="button" className="picked-chip" onClick={() => onRemove(id)} aria-label={`${nameOf(id)} 빼기`}>
          <span className="picked-chip__no">{i + 1}</span>{nameOf(id)}<span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}

function MapPicker({ list, picked, selectedId, onSelect, geo, follow, onFollowChange, onToggle, onShowList }) {
  const selected = list.find((a) => a.id === selectedId) ?? null;
  const locatedCount = list.filter(hasLatLng).length;

  // "내 위치" 버튼: 아직 안 켰으면 켜고, 켜져 있으면 내 위치로 지도를 다시 따라가게 해요.
  const onMyLocation = () => {
    onFollowChange(true);
    if (geo.status !== GEO_STATUS.TRACKING) geo.start();
  };

  return (
    <MapView
      attractions={list}
      pickedIds={picked}
      selectedId={selectedId}
      onSelect={onSelect}
      myPosition={geo.position}
      follow={follow}
      onFollowChange={onFollowChange}
      sheetOffset={selected ? SHEET_OFFSET_PX : 0}
      onShowList={onShowList}
    >
      {/* 지도 위 오른쪽 위: 내 위치 버튼 */}
      <button type="button" className="map-ctrl" onClick={onMyLocation}
        disabled={geo.status === GEO_STATUS.REQUESTING}
        aria-pressed={geo.status === GEO_STATUS.TRACKING && follow}>
        <Icon name="locate" size={18} strokeWidth={2.2} />
        {locationButtonLabel(geo.status, follow)}
      </button>

      {/* 지도 위 버튼 밑: 안내 문구 (문제 있을 때만) */}
      <div className="map-notices">
        <GeoNotice status={geo.status} onRetry={geo.start} />
        {locatedCount === 0 && list.length > 0 && (
          <output className="map-notice">지도에 표시할 위치 정보가 없어요. 목록에서 골라 주세요.</output>
        )}
      </div>

      {selected && (
        <AttractionPreviewSheet
          attraction={selected}
          pickOrder={picked.indexOf(selected.id) + 1}
          full={picked.length >= ROUTE_MAX_PICK}
          maxCount={ROUTE_MAX_PICK}
          myPosition={geo.position}
          onToggle={() => { onToggle(selected.id); onSelect(null); }}
          onClose={() => onSelect(null)}
        />
      )}
    </MapView>
  );
}

function RideList({ list, picked, onToggle, geo, sortNear, onSortNear }) {
  // "가까운 순": 위치가 없으면 먼저 위치를 켜요.
  const toggleSortNear = () => {
    if (!sortNear && geo.status !== GEO_STATUS.TRACKING) geo.start();
    onSortNear(!sortNear);
  };
  const waitingMessage = geoMessage(geo.status) || '내 위치를 확인하는 중이에요…';

  return (
    <div className="stack gap-8">
      <div className="row gap-8" style={{ flexShrink: 0 }}>
        <button type="button" className={`chip${sortNear ? ' on' : ''}`} aria-pressed={sortNear} onClick={toggleSortNear}>
          가까운 순
        </button>
        {sortNear && !geo.position && <span className="small muted">{waitingMessage}</span>}
      </div>
      {list.map((a) => (
        <RideRow key={a.id} ride={a} on={picked.includes(a.id)} onToggle={onToggle} />
      ))}
    </div>
  );
}

function RideRow({ ride: a, on, onToggle }) {
  const closed = a.status !== 'OPERATING';
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={closed} onClick={() => onToggle(a.id)} className="row gap-12"
      style={{ width: '100%', minHeight: 60, padding: '8px 14px 8px 12px', borderRadius: 18, flexShrink: 0, ...rideItemStyle(closed, on) }}>
      <span className="icon-circle" style={{ width: 24, height: 24, borderRadius: 8, background: on ? 'var(--blue)' : '#fff', border: `2px solid ${on ? 'var(--blue)' : '#AEB8CB'}`, color: '#fff' }}>
        {on && <Icon name="check" size={15} strokeWidth={3} />}
      </span>
      <img src={a.image} alt="" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }} />
      <span className="stack grow" style={{ gap: 2, textAlign: 'left' }}>
        <span className="bold" style={{ fontSize: 15 }}>{a.name}</span>
        {a.distanceM != null && (
          <span className="small" style={{ color: 'var(--blue-ink)' }}>
            {formatDistance(a.distanceM)}, 걸어서 약 {estimateWalkMinutes(a.distanceM)}분
          </span>
        )}
      </span>
      <span className="small muted">{closed ? '운영 안 함' : a.zone}</span>
    </button>
  );
}

function SubmitBar({ onSubmit, disabled, submitting, locating }) {
  return (
    <div className="bottom-bar">
      <button type="button" className="btn btn-pink" onClick={onSubmit} disabled={disabled}>
        <Icon name="map" size={20} strokeWidth={2} />
        {submitLabel(locating, submitting)}
      </button>
    </div>
  );
}

// 지도 위 위치 안내. <output>: 바뀌는 안내 문구를 스크린리더가 알아서 읽어 주는 태그예요. (role="status" 대신)
function GeoNotice({ status, onRetry }) {
  const message = geoMessage(status);
  if (!message) return null;
  return (
    <output className="map-notice">
      <span>{message}</span>
      {status === GEO_STATUS.TIMEOUT && (
        <button type="button" className="map-notice__retry" onClick={onRetry}>다시 시도</button>
      )}
    </output>
  );
}

// 추천에 쓸 입장권. 없으면 안내, 1장이면 이름만, 여러 장이면 고르게 해요.
function TicketBox({ tickets, ticketId, onChange }) {
  if (tickets.error) return <span className="error-text" role="alert">{tickets.error.message}</span>;
  const list = tickets.data || [];
  if (list.length === 0) {
    return (
      <div style={{ background: '#FFF8E1', borderRadius: 14, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: '#5A3B00', flexShrink: 0 }}>
        입장 처리된 오늘 입장권이 있어야 루트를 추천받을 수 있어요. 입장 게이트에서 입장권을 확인받은 뒤 이용해 주세요.{' '}
        <Link to="/my/tickets">내 입장권 보기</Link>
      </div>
    );
  }
  return (
    <section className="card stack gap-8" aria-labelledby="route-ticket-title"
      style={{ borderRadius: 18, padding: '12px 14px', flexShrink: 0 }}>
      <h2 id="route-ticket-title" className="row gap-4 small bold" style={{ margin: 0 }}>
        <Icon name="ticket" size={16} strokeWidth={2} />적용 입장권
      </h2>
      {list.length === 1 ? (
        <span className="small" style={{ color: 'var(--blue-ink)' }}>
          <span className="bold">{list[0].name}</span> <span className="muted">({list[0].code}) · 오늘 입장 완료</span>
        </span>
      ) : (
        <>
          <label htmlFor="route-ticket" className="sr-only">사용할 입장권</label>
          <select id="route-ticket" className="input" value={ticketId} onChange={(e) => onChange(Number(e.target.value))} style={{ fontSize: 14 }}>
            {list.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
        </>
      )}
      <span className="small muted">입장 처리된 오늘 입장권만 사용할 수 있어요.</span>
    </section>
  );
}

// 오류 문장 아래에 붙는 "다음 행동" 버튼
function ErrorAction({ action, onRetry }) {
  switch (action) {
    case 'MY_RESERVATIONS':
      return <Link to="/my/reservations" className="btn btn-outline btn-sm">내 예약 보기</Link>;
    case 'MY_TICKETS':
      return <Link to="/my/tickets" className="btn btn-outline btn-sm">내 입장권 보기</Link>;
    case 'RETRY_LOCATION':
      return (
        <>
          <span className="small muted">건물 밖이나 하늘이 트인 곳에서 다시 측정하면 정확도가 좋아져요.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>위치 다시 측정하기</button>
        </>
      );
    case 'RELOAD':
      return <button type="button" className="btn btn-outline btn-sm" onClick={() => window.location.reload()}>어트랙션 목록 새로고침</button>;
    default:
      return null;
  }
}
