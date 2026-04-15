$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $path = "c:\Users\hp\Desktop\Projects Qoder\New folder\Weighbrige System\POLYTRA TRACKING REPORT.xlsx"
    if (-not (Test-Path $path)) { Write-Output "NOT_FOUND"; exit }
    $wb = $excel.Workbooks.Open($path)
    $ws = $wb.Worksheets.Item(1)
    
    $cols = $ws.UsedRange.Columns.Count
    
    # Try to find the header row by looking for "S/N" or "Trip ID" or "Vehicle"
    for ($r = 1; $r -le 10; $r++) {
        $rowTxt = ""
        for ($c = 1; $c -le $cols; $c++) {
            $val = $ws.Cells.Item($r, $c).Value2
            $rowTxt += "$val | "
        }
        Write-Output "ROW_$r: $rowTxt"
    }
    
    $wb.Close($false)
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
} finally {
    $excel.Quit()
}
