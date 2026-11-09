package kr.ila.admin.kits.csv;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public final class CsvWriter {
    private CsvWriter() {
    }

    public static void write(Path path, CsvTable table) throws IOException {
        CsvValidator.ValidationResult result = CsvValidator.validate(table, null);
        if (!result.valid()) {
            throw new IOException(result.message());
        }

        try (BufferedWriter writer = Files.newBufferedWriter(
                path,
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING,
                StandardOpenOption.WRITE)) {
            writer.write('\uFEFF');
            writeRow(writer, table.headers());
            for (var row : table.rows()) {
                writeRow(writer, row);
            }
        }
    }

    private static void writeRow(BufferedWriter writer, java.util.List<String> values)
            throws IOException {
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                writer.write(',');
            }
            String value = values.get(i);
            String firstNonWhitespace = value.stripLeading();
            if (value.startsWith("\t") || value.startsWith("\r") || value.startsWith("\n")
                    || firstNonWhitespace.startsWith("=") || firstNonWhitespace.startsWith("+")
                    || firstNonWhitespace.startsWith("@") || firstNonWhitespace.startsWith("-")) {
                value = "'" + value;
            }
            writer.write('"');
            writer.write(value.replace("\"", "\"\""));
            writer.write('"');
        }
        writer.write("\r\n");
    }
}
