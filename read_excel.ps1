$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $path = "c:\Users\hp\Desktop\Projects Qoder\New folder\Weighbrige System\POLYTRA TRACKING REPORT.xlsx"
    $wb = $excel.Workbooks.Open($path)
    $ws = $wb.Worksheets.Item(1)
    
    $cols = $ws.UsedRange.Columns.Count
    $rows = 20
    
    for ($r = 1; $r -le $rows; $r++) {
        $rowValues = @()
        for ($c = 1; $c -le $cols; $c++) {
            $val = $ws.Cells.Item($r, $c).Value2
            if ($val -eq $null) { $val = "" }
            $rowValues += [string]$val
        }
        $line = $rowValues -join " | "
        if ($line.Trim() -ne "") {
            Write-Output "ROW $r : $line"
        }
    }
    
    $wb.Close($false)
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
} finally {
    $excel.Quit()
}
