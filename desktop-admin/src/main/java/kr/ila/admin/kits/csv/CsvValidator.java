package kr.ila.admin.kits.csv;

import java.util.List;
import java.util.Objects;

public final class CsvValidator {
    private CsvValidator() {
    }

    public static ValidationResult validate(CsvTable table, List<String> expectedHeaders) {
        Objects.requireNonNull(table, "table");
        if (table.headers().isEmpty()) {
            return ValidationResult.invalid("파일에 제목 행이 없습니다.");
        }
        if (table.headers().stream().anyMatch(header -> header.isBlank())) {
            return ValidationResult.invalid("제목 행에 비어 있는 항목이 있습니다.");
        }
        if (expectedHeaders != null && !table.headers().equals(expectedHeaders)) {
            return ValidationResult.invalid("선택한 자료 종류와 CSV 제목 행이 다릅니다.");
        }
        for (int i = 0; i < table.rows().size(); i++) {
            if (table.rows().get(i).size() != table.headers().size()) {
                return ValidationResult.invalid((i + 2) + "번째 줄의 칸 수가 제목 행과 다릅니다.");
            }
        }
        return ValidationResult.success();
    }

    public record ValidationResult(boolean valid, String message) {
        private static ValidationResult success() {
            return new ValidationResult(true, "파일 형식이 올바릅니다.");
        }

        private static ValidationResult invalid(String message) {
            return new ValidationResult(false, message);
        }
    }
}
