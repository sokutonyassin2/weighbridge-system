$e = New-Object -ComObject Excel.Application
$e.Visible = $false
try {
    $p = 'c:\Users\hp\Desktop\Projects Qoder\New folder\Weighbrige System\POLYTRA TRACKING REPORT.xlsx'
    $b = $e.Workbooks.Open($p)
    $s = $b.Worksheets.Item(1)
    for ($r = 1; $r -le 10; $r++) {
        $l = ""
        for ($c = 1; $c -le 20; $c++) {
            $v = $s.Cells.Item($r, $c).Value2
            $l += "$v | "
        }
        Write-Output $l
    }
    $b.Close($false)
} catch {
    Write-Output "ERR"
} finally {
    $e.Quit()
}
