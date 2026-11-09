package kr.ila.admin.modules.csv;

import kr.ila.admin.kits.csv.CsvReader;
import kr.ila.admin.kits.csv.CsvTable;
import kr.ila.admin.kits.csv.CsvValidator;
import kr.ila.admin.kits.csv.CsvWriter;
import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextField;
import javax.swing.SwingWorker;
import javax.swing.table.AbstractTableModel;
import javax.swing.filechooser.FileNameExtensionFilter;

@SuppressWarnings("serial")
public final class CsvPanel extends JPanel {
    private final CsvExportService exportService;
    private final JComboBox<CsvDataset> dataset = new JComboBox<>(CsvDataset.values());
    private final JTextField from = new JTextField(LocalDate.now().withDayOfYear(1).toString(), 10);
    private final JTextField to = new JTextField(LocalDate.now().toString(), 10);
    private final JLabel status = new JLabel("자료를 선택하거나 CSV 파일을 열어주세요.");
    private final PreviewModel previewModel = new PreviewModel();
    private final JTable preview = new JTable(previewModel);
    private final JButton exportButton = new JButton("CSV 내보내기");
    private final JButton openButton = new JButton("CSV 열기");

    public CsvPanel(CsvExportService exportService) {
        this.exportService = Objects.requireNonNull(exportService, "exportService");
        setLayout(new BorderLayout(8, 8));
        add(createControls(), BorderLayout.NORTH);
        add(new JScrollPane(preview), BorderLayout.CENTER);
        status.setBorder(javax.swing.BorderFactory.createEmptyBorder(4, 8, 4, 8));
        add(status, BorderLayout.SOUTH);
        exportButton.addActionListener(event -> exportCsv());
        openButton.addActionListener(event -> openCsv());
    }

    private JPanel createControls() {
        JPanel controls = new JPanel(new GridLayout(2, 1, 4, 4));
        JPanel filters = new JPanel(new FlowLayout(FlowLayout.LEADING));
        filters.add(new JLabel("자료 종류"));
        filters.add(dataset);
        filters.add(new JLabel("시작일 (yyyy-MM-dd)"));
        filters.add(from);
        filters.add(new JLabel("종료일"));
        filters.add(to);

        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEADING));
        actions.add(exportButton);
        actions.add(openButton);
        controls.add(filters);
        controls.add(actions);
        return controls;
    }

    private void exportCsv() {
        CsvDataset selected = (CsvDataset) dataset.getSelectedItem();
        if (selected == null) {
            showMessage("자료 종류를 선택해주세요.");
            return;
        }

        final CsvExportRequest request;
        try {
            request = new CsvExportRequest(
                    selected,
                    LocalDate.parse(from.getText().trim()),
                    LocalDate.parse(to.getText().trim()));
        } catch (DateTimeParseException exception) {
            showMessage("날짜를 yyyy-MM-dd 형식으로 입력해주세요.");
            return;
        } catch (IllegalArgumentException exception) {
            showMessage(exception.getMessage());
            return;
        }

        JFileChooser chooser = csvChooser();
        chooser.setSelectedFile(Path.of(selected.apiValue() + "_" + request.from() + "_"
                + request.to() + ".csv").toFile());
        if (chooser.showSaveDialog(this) != JFileChooser.APPROVE_OPTION) {
            showMessage("CSV 저장을 취소했습니다.");
            return;
        }
        Path selectedDestination = chooser.getSelectedFile().toPath();
        String fileName = selectedDestination.getFileName().toString();
        if (!fileName.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            selectedDestination = selectedDestination.resolveSibling(fileName + ".csv");
        }
        Path destination = selectedDestination;
        if (Files.exists(destination)
                && JOptionPane.showConfirmDialog(
                        this,
                        "같은 이름의 파일이 있습니다. 덮어쓸까요?",
                        "파일 덮어쓰기 확인",
                        JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) {
            showMessage("CSV 저장을 취소했습니다.");
            return;
        }
        setBusy(true, "서버 자료를 불러와 CSV 파일을 저장하고 있습니다...");

        new SwingWorker<CsvTable, Void>() {
            @Override
            protected CsvTable doInBackground() throws IOException {
                CsvTable table = exportService.export(request);
                validate(table, selected.headers());
                CsvWriter.write(destination, table);
                return table;
            }

            @Override
            protected void done() {
                try {
                    CsvTable table = get();
                    previewModel.setTable(table);
                    showMessage(table.rows().size() + "건을 CSV로 저장했습니다.");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    showMessage("작업이 중단되었습니다.");
                } catch (ExecutionException exception) {
                    showMessage(messageOf(exception.getCause()));
                } finally {
                    setBusy(false, status.getText());
                }
            }
        }.execute();
    }

    private void openCsv() {
        JFileChooser chooser = csvChooser();
        if (chooser.showOpenDialog(this) != JFileChooser.APPROVE_OPTION) {
            showMessage("CSV 열기를 취소했습니다.");
            return;
        }

        Path source = chooser.getSelectedFile().toPath();
        CsvDataset selected = (CsvDataset) dataset.getSelectedItem();
        setBusy(true, "CSV 파일을 읽고 형식을 확인하고 있습니다...");
        new SwingWorker<CsvTable, Void>() {
            @Override
            protected CsvTable doInBackground() throws IOException {
                CsvTable table = CsvReader.read(source);
                validate(table, selected == null ? null : selected.headers());
                return table;
            }

            @Override
            protected void done() {
                try {
                    CsvTable table = get();
                    previewModel.setTable(table);
                    showMessage(source.getFileName() + " 파일을 읽었습니다. " + table.rows().size() + "건");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    showMessage("작업이 중단되었습니다.");
                } catch (ExecutionException exception) {
                    showMessage(messageOf(exception.getCause()));
                } finally {
                    setBusy(false, status.getText());
                }
            }
        }.execute();
    }

    private static void validate(CsvTable table, List<String> expectedHeaders) throws IOException {
        CsvValidator.ValidationResult result = CsvValidator.validate(table, expectedHeaders);
        if (!result.valid()) {
            throw new IOException(result.message());
        }
    }

    private JFileChooser csvChooser() {
        JFileChooser chooser = new JFileChooser();
        chooser.setFileFilter(new FileNameExtensionFilter("CSV 파일 (*.csv)", "csv"));
        return chooser;
    }

    private void setBusy(boolean busy, String message) {
        exportButton.setEnabled(!busy);
        openButton.setEnabled(!busy);
        dataset.setEnabled(!busy);
        from.setEnabled(!busy);
        to.setEnabled(!busy);
        status.setText(message);
    }

    private void showMessage(String message) {
        status.setText(message);
    }

    private static String messageOf(Throwable error) {
        String message = error.getMessage();
        return message == null || message.isBlank()
                ? "CSV 작업에 실패했습니다."
                : "CSV 작업에 실패했습니다: " + message;
    }

    @SuppressWarnings("serial")
    private static final class PreviewModel extends AbstractTableModel {
        private CsvTable table = new CsvTable(List.of(), List.of());

        private void setTable(CsvTable table) {
            this.table = table;
            fireTableStructureChanged();
        }

        @Override
        public int getRowCount() {
            return table.rows().size();
        }

        @Override
        public int getColumnCount() {
            return table.headers().size();
        }

        @Override
        public String getColumnName(int column) {
            return table.headers().get(column);
        }

        @Override
        public Object getValueAt(int rowIndex, int columnIndex) {
            return table.rows().get(rowIndex).get(columnIndex);
        }
    }
}
