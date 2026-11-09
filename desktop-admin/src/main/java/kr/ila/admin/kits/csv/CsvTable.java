package kr.ila.admin.kits.csv;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public record CsvTable(List<String> headers, List<List<String>> rows) {
    public CsvTable {
        headers = List.copyOf(Objects.requireNonNull(headers, "headers"));
        List<List<String>> copiedRows = new ArrayList<>();
        for (List<String> row : Objects.requireNonNull(rows, "rows")) {
            copiedRows.add(List.copyOf(row));
        }
        rows = List.copyOf(copiedRows);
    }
}
