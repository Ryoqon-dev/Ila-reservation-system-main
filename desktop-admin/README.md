# Java Swing CSV module

This folder contains 박교범's CSV export, file-reading, preview, and validation work. It uses only the Java standard library and targets Java 21.

`CsvPanel` is a Swing `JPanel` that can be added to the administrator window. Its `CsvExportService` constructor parameter is the connection point for the shared `ApiClient`; the module does not create a second HTTP client. The service adapter should retrieve every page returned by the existing export API before returning the table. Until the shared client is available, the CSV reader, writer, and validator can be used and tested independently.

## Compile and run tests on Windows

Run these commands from the repository root in PowerShell:

```powershell
$sources = Get-ChildItem desktop-admin\src\main\java, desktop-admin\src\test\java -Recurse -Filter *.java
$classes = Join-Path $env:TEMP 'ila-csv-classes'
New-Item -ItemType Directory -Force $classes | Out-Null
javac -encoding UTF-8 -d $classes $sources.FullName
java -ea -cp $classes kr.ila.admin.kits.csv.CsvModuleTest
```

The test runner checks Korean text, UTF-8 BOM, quoted commas, escaped quotes, multi-line cells, malformed rows, round-trip saving, and formula-like cell protection.
