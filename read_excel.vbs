Set objExcel = CreateObject("Excel.Application")
objExcel.Visible = False
Set objWorkbook = objExcel.Workbooks.Open("C:\Users\hp\Desktop\Projects Qoder\New folder\Weighbrige System\POLYTRA TRACKING REPORT.xlsx")
Set objWorksheet = objWorkbook.Worksheets(1)

For r = 1 To 15
    line = ""
    For c = 1 To 25
        val = objWorksheet.Cells(r, c).Value
        If IsNull(val) Or IsEmpty(val) Then val = ""
        line = line & val & " | "
    Next
    WScript.Echo "ROW_" & r & ": " & line
Next

objWorkbook.Close False
objExcel.Quit
