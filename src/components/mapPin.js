// 지도 핀의 "모양 정보"를 계산하는 작은 함수 모음이에요.
// 카카오맵(AttractionMap)과 간이 지도(SimpleAttractionMap)가 같이 써서, 두 지도의 핀 규칙이 항상 같아요.
// (삼항 연산자를 겹쳐 쓰면 읽기 어려워서, if 문으로 풀어 함수로 뺐어요)

// 핀 겹침 순서: 미리보기 중인 핀 > 고른 핀 > 나머지
export function pinZIndex(selected, pickOrder) {
    if (selected) return 10;
    if (pickOrder > 0) return 3;
    return 1;
}

// 핀 동그라미 안 글자: 운영 안 함 '×', 고른 핀은 순서 숫자, 아직 안 고른 핀 '+'
export function pinDotText(closed, pickOrder) {
    if (closed) return '×';
    if (pickOrder > 0) return String(pickOrder);
    return '+';
}

// 스크린리더가 읽어 줄 상태 문장
export function pinStateText(closed, pickOrder) {
    if (closed) return '운영 안 함';
    if (pickOrder > 0) return `${pickOrder}번째로 고름`;
    return '아직 안 고름';
}

// 핀 버튼의 aria-label: "범퍼카, 아메리칸 어드벤처 1번째로 고름"
export function pinAriaLabel(a, closed, pickOrder) {
    return `${a.name}, ${a.zone || ''} ${pinStateText(closed, pickOrder)}`.replace(/\s+/g, ' ');
}