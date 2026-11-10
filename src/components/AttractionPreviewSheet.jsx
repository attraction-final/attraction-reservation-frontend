import Icon from './Icon.jsx';
import { estimateWalkMinutes, formatDistance, haversine } from '../utils/geo.js';

/**
 * 지도에서 핀을 눌렀을 때 아래에서 올라오는 "미리보기" 카드예요.
 * 핀을 누르는 것은 미리보기일 뿐이고, 루트에 넣는 "확정"은 이 카드의 버튼으로만 해요.
 * (지도는 손가락이 스치기만 해도 눌리기 쉬워서, 실수로 고르는 일을 막으려고 나눴어요)
 *
 * props
 *  - attraction : { id, name, zone, image, status, lat, lng }
 *  - pickOrder  : 이미 고른 어트랙션이면 몇 번째인지(1~5), 아니면 0
 *  - full       : 이미 다 골라서 더 못 고르면 true
 *  - maxCount   : 고를 수 있는 개수 (5)
 *  - myPosition : 내 위치 (있으면 거리·도보 시간을 보여 줘요)
 *  - onToggle   : "고르기" / "빼기" 버튼
 *  - onClose    : 닫기 (= 미리보기 해제)
 */
export default function AttractionPreviewSheet({ attraction: a, pickOrder, full, maxCount, myPosition, onToggle, onClose }) {
  const closed = a.status !== 'OPERATING';
  const straightM = myPosition ? haversine(myPosition, a) : null;
  const disabled = closed || (!pickOrder && full);

  return (
    <div className="map-sheet" role="dialog" aria-label={`${a.name} 미리보기`}>
      <div className="row gap-12">
        <img src={a.image} alt="" className="map-sheet__img" />
        <span className="stack grow" style={{ gap: 3 }}>
          <span className="bold" style={{ fontSize: 16 }}>{a.name}</span>
          <span className="small muted">{closed ? '지금 운영하지 않아요' : a.zone}</span>
          {straightM != null && (
            // 첫 구간과 같은 방식으로 추정한 값이라 "약"을 붙여요
            <span className="row gap-4 small" style={{ color: 'var(--blue-ink)' }}>
              <Icon name="walk" size={14} strokeWidth={2} />
              직선 {formatDistance(straightM)}, 걸어서 약 {estimateWalkMinutes(straightM)}분
            </span>
          )}
        </span>
        <button type="button" className="icon-btn" aria-label="미리보기 닫기" onClick={onClose} style={{ alignSelf: 'flex-start', marginTop: -6, marginRight: -8 }}>
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>×</span>
        </button>
      </div>

      {!pickOrder && full && !closed && (
        <span className="small muted">이미 {maxCount}개를 골랐어요. 하나를 빼면 이 어트랙션을 넣을 수 있어요.</span>
      )}

      <button type="button" disabled={disabled} onClick={onToggle}
        className={pickOrder ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm'} style={{ width: '100%' }}>
        {pickOrder ? `루트에서 빼기 (${pickOrder}번째)` : '루트에 넣기'}
      </button>
    </div>
  );
}
