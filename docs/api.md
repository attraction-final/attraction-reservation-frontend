# API 요약

[README](../README.md)로 돌아가기

프론트엔드가 실제로 호출하는 API를 **한눈에 보기 쉽게** 정리한 문서입니다.
요청 · 응답 필드 하나하나는 적지 않았습니다. 자세한 내용은 [백엔드 저장소](https://github.com/attraction-final/attraction-reservation)를 참고해 주세요.

## 공통 규칙

| 항목 | 내용 |
|---|---|
| 기본 주소 | 모든 주소 앞에 `/api` 가 붙습니다. |
| 응답 형식 | `{ success, message, data }` 형태로 감싸서 응답합니다. |
| 인증 | 로그인 후 받은 Access Token을 `Authorization: Bearer {토큰}` 헤더에 담습니다. |
| 토큰 재발급 | Access Token이 만료되면(401) `POST /api/auth/refresh` 로 다시 받습니다. (Refresh Token은 쿠키) |
| CSRF | `/api/auth/**`, `/api/users/signup` 의 GET이 아닌 요청은 먼저 `GET /api/auth/csrf` 를 호출합니다. |
| 관리자 API | `/api/admin/**` 는 `ADMIN` 권한이 있어야 호출할 수 있습니다. |

## 인증 · 회원

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/auth/csrf` | CSRF 토큰을 발급합니다. |
| POST | `/api/auth/login` | 이메일로 로그인합니다. |
| POST | `/api/auth/refresh` | Access Token을 재발급합니다. |
| POST | `/api/auth/logout` | 로그아웃합니다. |
| POST | `/api/auth/oauth2/exchange` | 소셜 로그인 일회용 코드를 토큰으로 교환합니다. |
| POST | `/api/users/signup` | 회원가입합니다. |
| GET | `/api/users/me` | 내 정보를 조회합니다. |
| PATCH | `/api/users/me` | 닉네임을 수정합니다. |
| DELETE | `/api/users/me` | 회원 탈퇴합니다. |
| PATCH | `/api/users/me/password` | 비밀번호를 변경합니다. |

## 어트랙션 · 슬롯

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/attractions` | 어트랙션 목록을 조회합니다. |
| GET | `/api/attractions/{id}` | 어트랙션 상세를 조회합니다. |
| GET | `/api/attractions/{id}/slots?date=` | 날짜별 예약 슬롯을 조회합니다. (로그인 필요) |
| POST | `/api/attractions/questions` | 어트랙션에 대해 질문합니다. (로그인 필요) |

## 예약

| 메서드 | 주소 | 설명 |
|---|---|---|
| POST | `/api/reservations` | 슬롯을 예약합니다. |
| GET | `/api/reservations/me` | 내 예약 목록을 조회합니다. |
| GET | `/api/reservations/{id}` | 내 예약 상세를 조회합니다. |
| PATCH | `/api/reservations/{id}/cancel` | 예약을 취소합니다. |

## 루트 추천

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/route-recommendations/attractions` | 추천에 고를 수 있는 어트랙션과 좌표를 조회합니다. |
| POST | `/api/route-recommendations` | 오늘 입장권·현재 위치·어트랙션 1~5개로 지금부터 22:00까지의 방문 순서와 슬롯을 추천받습니다. (예약은 만들지 않음) |
| POST | `/api/route-recommendations/{recommendationId}/reservations` | 추천 경로의 방문을 한 번에 예약합니다. 하나라도 실패하면 전부 취소됩니다. |

## 입장권 · 주문 · 결제

| 메서드 | 주소 | 설명 |
|---|---|---|
| GET | `/api/ticket-products` | 입장권 상품 목록을 조회합니다. |
| GET | `/api/tickets/me` | 내 입장권을 조회합니다. |
| POST | `/api/orders` | 주문을 생성합니다. |
| GET | `/api/orders/me` | 내 주문(결제) 내역을 조회합니다. |
| GET | `/api/orders/{id}` | 주문 상세를 조회합니다. |
| GET | `/api/config/portone` | 포트원 결제창 설정값을 조회합니다. |
| POST | `/api/payments/{pgId}/confirm` | 결제를 승인합니다. |
| POST | `/api/payments/{pgId}/refunds/partial` | 입장권 한 장을 환불합니다. |

## 관리자 (ADMIN)

| 메서드 | 주소 | 설명 |
|---|---|---|
| POST | `/api/admin/attractions` | 어트랙션을 등록합니다. |
| PATCH | `/api/admin/attractions/{id}` | 어트랙션을 수정합니다. |
| DELETE | `/api/admin/attractions/{id}` | 어트랙션을 삭제합니다. |
| PATCH | `/api/admin/attractions/{id}/status` | 어트랙션 운영 상태를 변경합니다. |
| GET | `/api/admin/attractions/{id}/slots` | 슬롯을 조회합니다. |
| POST | `/api/admin/attractions/{id}/slots` | 슬롯을 추가합니다. |
| PATCH | `/api/admin/slots/{id}/status` | 슬롯 상태를 변경합니다. |
| PATCH | `/api/admin/slots/{id}/time` | 슬롯 시간을 변경합니다. |
| PATCH | `/api/admin/slots/{id}/capacity` | 슬롯 정원을 변경합니다. |
| DELETE | `/api/admin/slots/{id}` | 슬롯을 삭제합니다. |
| GET | `/api/admin/reservations` | 전체 예약을 조회합니다. |
| PATCH | `/api/admin/reservations/{id}/status` | 예약 상태를 변경합니다. |
| PATCH | `/api/admin/reservations/{id}/cancel` | 예약을 취소합니다. |
| GET | `/api/admin/users` | 회원 목록을 조회합니다. |
| PATCH | `/api/admin/users/{id}/status` | 회원 상태를 변경합니다. |
| POST | `/api/admin/ticket-products` | 입장권 상품을 등록합니다. |
| PUT | `/api/admin/ticket-products/{id}` | 입장권 상품을 수정합니다. |
| DELETE | `/api/admin/ticket-products/{id}` | 입장권 상품을 삭제합니다. |
| GET | `/api/admin/orders` | 주문 목록을 조회합니다. |
| GET | `/api/admin/orders/{id}` | 주문 상세를 조회합니다. |
| POST | `/api/admin/orders/{id}/cancel` | 결제 대기 중인 주문을 취소합니다. |
| POST | `/api/admin/payments/{pgId}/refunds` | 전체 환불합니다. |
| POST | `/api/admin/payments/{pgId}/refunds/partial` | 부분 환불합니다. |
| POST | `/api/admin/tickets/entry` | 입장권 코드로 입장 처리합니다. |
