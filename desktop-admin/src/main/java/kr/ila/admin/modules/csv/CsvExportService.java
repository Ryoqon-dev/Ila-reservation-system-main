package kr.ila.admin.modules.csv;

import kr.ila.admin.kits.csv.CsvTable;
import java.io.IOException;

@FunctionalInterface
public interface CsvExportService {
    CsvTable export(CsvExportRequest request) throws IOException;
}
