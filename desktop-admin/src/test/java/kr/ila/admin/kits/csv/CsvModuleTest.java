package kr.ila.admin.kits.csv;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import javax.swing.SwingUtilities;
import kr.ila.admin.modules.csv.CsvDataset;
import kr.ila.admin.modules.csv.CsvExportRequest;
import kr.ila.admin.modules.csv.CsvPanel;

public final class CsvModuleTest {
    private static int passed;

    private CsvModuleTest() {
    }

    public static void main(String[] args) throws Exception {
        run("읽기: UTF-8 BOM과 한글", CsvModuleTest::readsBomAndKorean);
        run("읽기: 쉼표와 따옴표", CsvModuleTest::readsCommaAndEscapedQuotes);
        run("읽기: 여러 줄 셀", CsvModuleTest::readsMultilineCell);
        run("검사: 헤더와 행 칸 수", CsvModuleTest::validatesHeadersAndRowWidths);
        run("읽기: 닫히지 않은 따옴표 오류", CsvModuleTest::rejectsUnclosedQuote);
        run("쓰기: UTF-8 BOM과 CSV 왕복", CsvModuleTest::writesAndReadsRoundTrip);
        run("쓰기: 스프레드시트 수식처럼 보이는 값 보호", CsvModuleTest::neutralizesFormulaValues);
        run("요청: 날짜 범위 검사", CsvModuleTest::validatesExportDateRange);
        run("화면: Swing 패널 생성", CsvModuleTest::createsSwingPanel);
        System.out.println("통과: " + passed + "개 테스트");
    }

    private static void readsBomAndKorean() throws Exception {
        CsvTable table = CsvReader.parse("\uFEFF이름,장소\r\n일아,강의실");
        equal(List.of("이름", "장소"), table.headers());
        equal(List.of("일아", "강의실"), table.rows().get(0));
        check(CsvValidator.validate(table, List.of("이름", "장소")).valid());
    }

    private static void readsCommaAndEscapedQuotes() throws Exception {
        CsvTable table = CsvReader.parse("제목,내용\r\n예약,\"회의실, 2층\"\r\n인용,\"그가 \"\"안녕\"\"이라고 했다\"");
        equal("회의실, 2층", table.rows().get(0).get(1));
        equal("그가 \"안녕\"이라고 했다", table.rows().get(1).get(1));
    }

    private static void readsMultilineCell() throws Exception {
        CsvTable table = CsvReader.parse("제목,내용\r\n기록,\"첫째 줄\r\n둘째 줄\"");
        equal("첫째 줄\r\n둘째 줄", table.rows().get(0).get(1));
    }

    private static void validatesHeadersAndRowWidths() throws Exception {
        CsvTable wrongHeader = CsvReader.parse("이름,다른 제목\r\n일아,강의실");
        check(!CsvValidator.validate(wrongHeader, List.of("이름", "장소")).valid());
        CsvTable wrongWidth = CsvReader.parse("이름,장소\r\n일아");
        CsvValidator.ValidationResult result = CsvValidator.validate(wrongWidth, null);
        check(!result.valid());
        check(result.message().contains("2번째 줄"));
        check(!CsvValidator.validate(new CsvTable(List.of(), List.of()), null).valid());
    }

    private static void rejectsUnclosedQuote() throws Exception {
        expectIOException(() -> CsvReader.parse("이름,내용\r\n일아,\"열리지 않은 값"));
    }

    private static void writesAndReadsRoundTrip() throws Exception {
        Path file = Files.createTempFile("ila-csv-test-", ".csv");
        try {
            CsvTable original = new CsvTable(
                    List.of("이름", "내용"),
                    List.of(List.of("일아", "따옴표 \"와 쉼표, 빈 값도 지원"), List.of("빈 칸", "")));
            CsvWriter.write(file, original);
            byte[] bytes = Files.readAllBytes(file);
            check(bytes[0] == (byte) 0xEF && bytes[1] == (byte) 0xBB && bytes[2] == (byte) 0xBF);
            equal(original, CsvReader.read(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    private static void neutralizesFormulaValues() throws Exception {
        Path file = Files.createTempFile("ila-csv-formula-test-", ".csv");
        try {
            CsvWriter.write(file, new CsvTable(List.of("내용"), List.of(List.of("=1+1"))));
            String content = Files.readString(file, StandardCharsets.UTF_8);
            check(content.contains("\"'=1+1\""));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    private static void validatesExportDateRange() throws Exception {
        new CsvExportRequest(CsvDataset.BOOKINGS,
                LocalDate.parse("2026-01-01"), LocalDate.parse("2026-01-02"));
        expectIllegalArgument(() -> new CsvExportRequest(CsvDataset.BOOKINGS,
                LocalDate.parse("2026-01-02"), LocalDate.parse("2026-01-01")));
    }

    private static void createsSwingPanel() throws Exception {
        SwingUtilities.invokeAndWait(() -> new CsvPanel(request ->
                new CsvTable(CsvDataset.BOOKINGS.headers(), List.of())));
    }

    private static void run(String name, CheckedRunnable test) throws Exception {
        test.run();
        passed++;
        System.out.println("통과: " + name);
    }

    private static void check(boolean condition) {
        if (!condition) {
            throw new AssertionError("조건이 참이어야 합니다.");
        }
    }

    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("예상: " + expected + ", 실제: " + actual);
        }
    }

    private static void expectIOException(CheckedRunnable action) throws Exception {
        try {
            action.run();
            throw new AssertionError("IOException이 발생해야 합니다.");
        } catch (IOException expected) {
            check(!expected.getMessage().isBlank());
        }
    }

    private static void expectIllegalArgument(CheckedRunnable action) throws Exception {
        try {
            action.run();
            throw new AssertionError("IllegalArgumentException이 발생해야 합니다.");
        } catch (IllegalArgumentException expected) {
            check(!expected.getMessage().isBlank());
        }
    }

    @FunctionalInterface
    private interface CheckedRunnable {
        void run() throws Exception;
    }
}
