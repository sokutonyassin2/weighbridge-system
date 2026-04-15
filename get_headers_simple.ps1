$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $path = 'c:\Users\hp\Desktop\Projects Qoder\New folder\Weighbrige System\POLYTRA TRACKING REPORT.xlsx'
    $wb = $excel.Workbooks.Open($path)
    $ws = $wb.Worksheets.Item(1)
    $cols = $ws.UsedRange.Columns.Count
    for ($r = 1; $r -le 10; $r++) {
        $rowTxt = ''
        for ($c = 1; $c -le $cols; $c++) {
            $val = $ws.Cells.Item($r, $c).Value2
            $rowTxt += "$val | "
        }
        Write-Output "ROW_$r: $rowTxt"
    }
    $wb.Close($false)
} catch {
    Write-Output "ERR"
} finally {
    $excel.Quit()
}
