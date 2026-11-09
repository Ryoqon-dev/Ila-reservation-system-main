package kr.ila.admin.modules.csv;

import java.util.List;

public enum CsvDataset {
    BOOKINGS("bookings", "예약 내역", List.of(
            "이용 날짜", "시작", "종료", "장소", "동아리", "동아리방 호수",
            "대표자", "연락처", "예약 상태", "입실 사진 확인", "퇴실 사진 확인")),
    PENALTIES("penalties", "벌점 내역", List.of(
            "발생 날짜", "동아리", "동아리방 호수", "벌점 종류", "차감 점수",
            "벌점 사유", "취소 여부", "학기 마감")),
    AUDIT("audit", "운영 기록", List.of("날짜", "처리 시각", "작업", "대상")),
    RESETS("resets", "학기 마감 이력", List.of(
            "날짜", "완료 시각", "학기·처리명", "대상 동아리", "기록 수", "초기화한 차감 점수")),
    CLUBS("clubs", "동아리 목록", List.of("수정 날짜", "동아리 이름", "동아리방 호수", "활성 여부"));

    private final String apiValue;
    private final String displayName;
    private final List<String> headers;

    CsvDataset(String apiValue, String displayName, List<String> headers) {
        this.apiValue = apiValue;
        this.displayName = displayName;
        this.headers = List.copyOf(headers);
    }

    public String apiValue() {
        return apiValue;
    }

    public List<String> headers() {
        return headers;
    }

    @Override
    public String toString() {
        return displayName;
    }
}
