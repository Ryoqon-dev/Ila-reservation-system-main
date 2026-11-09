package kr.ila.admin.modules.csv;

import java.time.LocalDate;
import java.util.Objects;

public record CsvExportRequest(CsvDataset dataset, LocalDate from, LocalDate to) {
    public CsvExportRequest {
        Objects.requireNonNull(dataset, "dataset");
        Objects.requireNonNull(from, "from");
        Objects.requireNonNull(to, "to");
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("시작일은 종료일보다 늦을 수 없습니다.");
        }
    }
}
