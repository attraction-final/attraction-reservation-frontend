import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { BackHeader } from '../components/ui.jsx';
import { routeApi } from '../api/index.js';

/*
 * 추천 결과 화면
 *  - 루트 추천 화면이 navigate state 로 넘겨준 result 를 보여 줘요. (추천 조회 API 는 없어요)
 *  - resultType
 *      FULL    : 고른 어트랙션 모두 방문 가능 → 결과 + 일괄 예약 버튼
 *      PARTIAL : 일부만 방문 가능            → 결과 + 제외 목록 + 일괄 예약 버튼(방문 가능한 것만 예약돼요)
 *      NONE    : 방문 가능한 경로 없음        → 제외 사유만, 예약 버튼 없음
 *  - 이동·대기·도착 시간은 모두 "예상"값이라 화면에 꼭 "예상"이라고 적어요.
 */
export default function RouteResult() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState('');
  // useState 는 다음 화면 그리기 때 바뀌어서, 아주 빠른 두 번 클릭은 못 막아요. 그래서 ref 로 한 번 더 잠가요.
  const lockRef = useRef(false);

  // 주소로 바로 들어와서 결과가 없으면 조건 화면으로 돌려보내요.
  if (!state?.result) return <Navigate to="/route" replace />;
  const r = state.result;
  const canReserve = r.resultType !== 'NONE' && r.recommendationId != null && !reserveError;

  // 일괄 예약: 전부 성공하거나, 하나라도 실패하면 전부 취소돼요. (일부만 예약되는 일은 없어요)
  const reserveAll = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setReserving(true);
    setReserveError('');
    try {
      const done = await routeApi.reserveAll(r.recommendationId);
      const first = done.reservations[0]?.number;
      const doneId = done.count > 1 ? `${first} 외 ${done.count - 1}건` : first;
      // replace: 뒤로 가기로 이 화면에 돌아와 같은 추천으로 다시 예약(→ 409)하는 일을 막아요.
      navigate('/my/reservations', { replace: true, state: { doneId } });
    } catch (e) {
      // 서버 문장 예) "2번째 방문 '범퍼카' 예약에 실패해 일괄 예약을 모두 취소했습니다. 사유: ..."
      // 실패한 추천으로는 다시 예약할 수 없어서, 잠금은 풀지 않고 "다시 추천받기"만 보여 줘요.
      setReserveError(e.message);
      setReserving(false);
    }
  };

  return (
    <div className="screen">
      <BackHeader title="추천 루트" to="/route" />
      <div className="screen-body pad stack gap-14">
        <span className="row gap-4 small" style={{ color: 'var(--blue-ink)', flexShrink: 0 }}>
          <Icon name="clock" size={14} strokeWidth={2} />
          <span className="bold">{r.startTime} ~ {r.endTime} 기준 추천</span>
          <span className="muted">· 위치 오차 약 {r.accuracyM}m</span>
        </span>

        {r.stalePosition && (
          <Notice>오래전에 확인한 위치로 계산했어요. 지금 위치와 다르면 다시 추천받아 주세요.</Notice>
        )}

        {r.resultType === 'NONE' ? (
          <Notice>선택한 조건에서 추천할 수 있는 경로가 없어요. 아래 이유를 확인하고 다른 어트랙션으로 다시 추천받아 주세요.</Notice>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, flexShrink: 0 }}>
              <Summary label="방문" value={`${r.recommendedCount}/${r.selectedCount}곳`} color="var(--pink-dark)" />
              <Summary label="예상 소요" value={`${r.totalDurationMinutes}분`} />
              <Summary label="예상 종료" value={r.estimatedEndTime ?? '-'} />
            </div>
            <span className="small muted" style={{ flexShrink: 0 }}>
              예상 이동 {r.totalMoveMinutes}분 · 예상 대기 {r.totalWaitMinutes}분 · 탑승 {r.totalRideMinutes}분
            </span>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} className="stack">
              {r.visits.map((v, i) => (
                <VisitItem key={v.attractionId} v={v} first={i === 0} last={i === r.visits.length - 1} />
              ))}
            </ol>
          </>
        )}

        {r.excluded.length > 0 && (
          <div className="stack gap-4">
            <span className="small bold">추천에서 빠진 어트랙션</span>
            {r.excluded.map((e) => (
              <span key={e.attractionId} className="small muted">· {e.name}: {e.reason}</span>
            ))}
          </div>
        )}

        <span className="small muted">
          이동·대기·도착 시간은 모두 예상값이에요. 첫 이동은 지금 위치와 어트랙션 좌표의 직선거리로 추정했어요.
        </span>

        {r.resultType !== 'NONE' && (
          <Notice>
            아직 예약되지 않았어요. 아래 버튼을 누르면 방문할 {r.recommendedCount}곳을 한 번에 예약해요.
            하나라도 예약에 실패하면 모두 취소돼요. 탑승 30분 전에 예약이 마감되니 너무 오래 기다리지 마세요.
          </Notice>
        )}

        {reserveError && <span className="error-text" role="alert">{reserveError}</span>}
      </div>

      <div className="bottom-bar">
        {canReserve && (
          <button type="button" className="btn btn-pink" onClick={reserveAll} disabled={reserving}>
            <Icon name="check" size={20} strokeWidth={2.4} />
            {reserving ? '예약 중…' : `${r.recommendedCount}곳 한 번에 예약하기`}
          </button>
        )}
        <Link to="/route" className="btn btn-outline">다시 추천받기</Link>
      </div>
    </div>
  );
}

// 방문 한 곳: [이동] → [어트랙션 카드] → [도착·대기·탑승 시각]
function VisitItem({ v, first, last }) {
  return (
    <li className="stack" style={{ gap: 8, paddingBottom: last ? 0 : 8 }}>
      {/* 이전 장소(처음엔 현재 위치)에서 이 방문지까지의 이동 */}
      <span className="row gap-4 small muted" style={{ paddingLeft: 44 }}>
        <Icon name="walk" size={14} strokeWidth={2} />
        {first ? '현재 위치에서 ' : ''}예상 이동 {v.moveMinutes}분{v.moveEstimated && ' (추정)'}
      </span>
      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <span className="display icon-circle" style={{ width: 32, height: 32, flexShrink: 0, background: 'var(--pink)', color: '#fff', fontSize: 17 }}>{v.order}</span>
        <Link to={`/attractions/${v.attractionId}`} className="card row gap-10 grow" style={{ borderRadius: 18, padding: 8, color: 'inherit', textDecoration: 'none' }}>
          <img src={v.image} alt={v.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
          <span className="stack grow" style={{ gap: 2 }}>
            <span className="bold" style={{ fontSize: 15 }}>{v.name}</span>
            <span className="small" style={{ color: 'var(--blue-ink)' }}>탑승 {v.rideStart} ~ {v.rideEnd}</span>
            <span className="small muted">도착 예정 {v.arrivalTime} · 예상 대기 {v.waitMinutes}분</span>
          </span>
          <Icon name="chevron" size={18} strokeWidth={2} />
        </Link>
      </div>
    </li>
  );
}

function Notice({ children }) {
  return (
    <div style={{ background: '#FFF8E1', borderRadius: 14, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: '#5A3B00', flexShrink: 0 }}>
      {children}
    </div>
  );
}

function Summary({ label, value, color }) {
  return (
    <div className="card stack" style={{ alignItems: 'center', gap: 2, borderRadius: 18, padding: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
      <span className="display" style={{ fontSize: 22, color: color || 'var(--ink)' }}>{value}</span>
    </div>
  );
}
