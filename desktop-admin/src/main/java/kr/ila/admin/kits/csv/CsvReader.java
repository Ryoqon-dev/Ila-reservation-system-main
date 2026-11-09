package kr.ila.admin.kits.csv;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class CsvReader {
    private CsvReader() {
    }

    public static CsvTable read(Path path) throws IOException {
        String content = Files.readString(path, StandardCharsets.UTF_8);
        return parse(content);
    }

    static CsvTable parse(String content) throws IOException {
        if (!content.isEmpty() && content.charAt(0) == '\uFEFF') {
            content = content.substring(1);
        }
        List<String> headers = new ArrayList<>();
        List<List<String>> rows = new ArrayList<>();
        List<String> currentRow = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean insideQuotes = false;
        boolean afterClosingQuote = false;
        boolean pendingRecord = false;
        int line = 1;

        for (int i = 0; i < content.length(); i++) {
            char current = content.charAt(i);

            if (insideQuotes) {
                if (current == '"') {
                    if (i + 1 < content.length() && content.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        insideQuotes = false;
                        afterClosingQuote = true;
                    }
                } else {
                    cell.append(current);
                    if (current == '\r') {
                        if (i + 1 < content.length() && content.charAt(i + 1) == '\n') {
                            cell.append('\n');
                            i++;
                        }
                        line++;
                    } else if (current == '\n') {
                        line++;
                    }
                }
                continue;
            }

            if (afterClosingQuote) {
                if (current == ',') {
                    currentRow.add(cell.toString());
                    cell.setLength(0);
                    afterClosingQuote = false;
                    pendingRecord = true;
                } else if (current == '\r' || current == '\n') {
                    currentRow.add(cell.toString());
                    rows.add(List.copyOf(currentRow));
                    currentRow.clear();
                    cell.setLength(0);
                    afterClosingQuote = false;
                    pendingRecord = false;
                    if (current == '\r' && i + 1 < content.length()
                            && content.charAt(i + 1) == '\n') {
                        i++;
                    }
                    line++;
                } else {
                    throw malformed(line, "닫는 따옴표 뒤에 쉼표나 줄바꿈이 필요합니다.");
                }
                continue;
            }

            if (current == '"') {
                if (cell.length() > 0) {
                    throw malformed(line, "따옴표 앞에 다른 문자가 있습니다.");
                }
                insideQuotes = true;
                pendingRecord = true;
            } else if (current == ',') {
                currentRow.add(cell.toString());
                cell.setLength(0);
                pendingRecord = true;
            } else if (current == '\r' || current == '\n') {
                currentRow.add(cell.toString());
                rows.add(List.copyOf(currentRow));
                currentRow.clear();
                cell.setLength(0);
                pendingRecord = false;
                if (current == '\r' && i + 1 < content.length()
                        && content.charAt(i + 1) == '\n') {
                    i++;
                }
                line++;
            } else {
                cell.append(current);
                pendingRecord = true;
            }
        }

        if (insideQuotes) {
            throw malformed(line, "따옴표가 닫히지 않았습니다.");
        }
        if (pendingRecord) {
            currentRow.add(cell.toString());
            rows.add(List.copyOf(currentRow));
        }
        if (!rows.isEmpty()) {
            headers = new ArrayList<>(rows.remove(0));
        }
        return new CsvTable(headers, rows);
    }

    private static IOException malformed(int line, String message) {
        return new IOException(line + "번째 줄: " + message);
    }
}
