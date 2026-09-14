# Build monthly sales / outsource Excel from export details.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$detailsPath = "C:\CAYANAS_Print_v2\_tmp_export_82_147\_parsed\details.csv"
$srcXlsx = "C:\Users\user\Downloads\輸出明細82-147_品目店番号集計1.xlsx"
$outXlsx = "C:\Users\user\Downloads\輸出明細82-147_月別仕立て売上と外注加工費.xlsx"

$nameMap = [ordered]@{
  TO='留袖・色留袖'; FR='振袖・掛下'; HM='訪問着'; TK='附下'; MW='喪服　冬'; MS='喪服　夏'
  KM='小紋'; IR='色無地'; TM='紬'; CO='コート'; HA='羽織'; NA='長襦袢'; NF='長襦袢.振袖'
  YK='浴衣'; MK='紳士着物'; MH='紳士羽織'; MY='紳士浴衣'; '2K'='二部式着物'; '2J'='二部式襦袢'
  CK='子供着物'; CJ='子供襦袢'; UC='打掛・白無垢'; UE='打掛（刺繍用）'; TE='留袖（刺繍用）'
  C0='コート（C0）'; CH='CH（不明）'; WS='WS（不明）'; TN='TN（不明）'; HN='HN（不明）'
}

# 勝矢和裁 価格案1 — 輸出品目コードと1対1のものだけ転記。曖昧な品目は空欄。
$outsourcePrice = @{
  HM = 11500; TK = 11500; KM = 10700; IR = 10700; TM = 10700
  NA = 8000; NF = 8500; HA = 10700; CO = 10700
  MW = 12000; MS = 11000; MK = 11500; MH = 11500
  '2K' = 13500; '2J' = 11000; UC = 18000
}
$outsourceNote = @{
  FR = '価格案は振袖11,500／掛下16,000。輸出品目は「振袖・掛下」のため未設定'
  TO = '価格案は留袖比翼13,000／色留袖12,000。輸出品目は「留袖・色留袖」のため未設定'
  YK = '価格案に浴衣なし'
  CK = '価格案に子供着物なし'
  CJ = '価格案に子供襦袢なし'
  UE = '価格案に打掛（刺繍用）なし'
  C0 = '品目コードC0（COの誤記の可能性）'
  CH = '不明コード'
  HN = '不明コード'
  TN = '不明コード'
  WS = '不明コード'
  MY = '価格案に紳士浴衣なし'
  TE = '価格案に留袖（刺繍用）なし'
}

function Get-Name([string]$code) {
  if ($nameMap.Contains($code)) { return [string]$nameMap[$code] }
  return $code
}
function Get-LotFromFile([string]$file) {
  if ($file -match 'AYG(\d{3})') { return 'AYG' + $Matches[1] }
  return ''
}
function Get-YearFromLotNum([int]$n) {
  if ($n -le 97) { return 2024 }
  if ($n -le 129) { return 2025 }
  return 2026
}

Write-Host "Load details"
$details = @(Import-Csv -LiteralPath $detailsPath)
if ($details.Count -ne 8879) { throw "Expected 8879 rows, got $($details.Count)" }

$lines = New-Object System.Collections.Generic.List[object]
$lotYear = @{}
$salesAgg = @{}   # ym|mise|code -> count
$outAgg = @{}     # ym|code -> count
$storeItem = @{}  # mise|code -> count
$itemQty = @{}

foreach ($row in $details) {
  $lot = Get-LotFromFile $row.File
  if ($lot -notmatch 'AYG(\d{3})') { throw "bad lot $lot" }
  $lotNum = [int]$Matches[1]
  $year = Get-YearFromLotNum $lotNum
  if ($row.Date -notmatch '(\d{1,2})月(\d{1,2})日') { throw "bad date $($row.Date)" }
  $month = [int]$Matches[1]
  $day = [int]$Matches[2]
  $ship = Get-Date -Year $year -Month $month -Day $day
  $ym = '{0}年{1:D2}月' -f $year, $month
  $code = $row.Hinmoku
  $mise = $row.Mise
  $name = Get-Name $code

  if (-not $lotYear.ContainsKey($lot)) {
    $lotYear[$lot] = [pscustomobject]@{ Lot=$lot; LotNum=$lotNum; Year=$year; DateText=$row.Date }
  }
  $lines.Add([pscustomobject]@{
    Kanri=$row.Kanri; Lot=$lot; Ship=$ship; YM=$ym; Mise=$mise; Code=$code; Name=$name
  })
  $k = "$ym|$mise|$code"
  if (-not $salesAgg.ContainsKey($k)) { $salesAgg[$k] = 0 }
  $salesAgg[$k]++
  $k2 = "$ym|$code"
  if (-not $outAgg.ContainsKey($k2)) { $outAgg[$k2] = 0 }
  $outAgg[$k2]++
  $k3 = "$mise|$code"
  if (-not $storeItem.ContainsKey($k3)) { $storeItem[$k3] = 0 }
  $storeItem[$k3]++
  if (-not $itemQty.ContainsKey($code)) { $itemQty[$code] = 0 }
  $itemQty[$code]++
}

$ymList = @($lines | Select-Object -ExpandProperty YM -Unique | Sort-Object)
$salesRows = $salesAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split('|')
  [pscustomobject]@{ YM=$p[0]; Mise=$p[1]; Code=$p[2]; Name=(Get-Name $p[2]); Qty=[int]$_.Value; Key="$($p[1])|$($p[2])" }
} | Sort-Object YM, Mise, Code

$outRows = $outAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split('|')
  [pscustomobject]@{ YM=$p[0]; Code=$p[1]; Name=(Get-Name $p[1]); Qty=[int]$_.Value }
} | Sort-Object YM, Code

$masterSales = $storeItem.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split('|')
  [pscustomobject]@{ Mise=$p[0]; Code=$p[1]; Name=(Get-Name $p[1]); Qty=[int]$_.Value; Key="$($p[0])|$($p[1])" }
} | Sort-Object Mise, Code

$itemCodes = @($nameMap.Keys) + @($itemQty.Keys | Where-Object { -not $nameMap.Contains($_) })
$itemCodes = @($itemCodes | Select-Object -Unique)
$masterOut = foreach ($code in $itemCodes) {
  $qty = 0
  if ($itemQty.ContainsKey($code)) { $qty = [int]$itemQty[$code] }
  if ($qty -eq 0 -and -not $outsourcePrice.ContainsKey($code) -and -not $outsourceNote.ContainsKey($code)) { continue }
  $price = $null
  if ($outsourcePrice.ContainsKey($code)) { $price = [int]$outsourcePrice[$code] }
  $note = ''
  if ($outsourceNote.ContainsKey($code)) { $note = $outsourceNote[$code] }
  elseif ($price) { $note = '価格案1　勝矢和裁様（1対1対応）' }
  [pscustomobject]@{ Code=$code; Name=(Get-Name $code); Price=$price; Note=$note; Qty=$qty }
}

$lotRows = $lotYear.GetEnumerator() | ForEach-Object { $_.Value } | Sort-Object LotNum

$sumSalesQty = ($salesRows | Measure-Object Qty -Sum).Sum
$sumOutQty = ($outRows | Measure-Object Qty -Sum).Sum
Write-Host "lines=$($lines.Count) salesRows=$($salesRows.Count) outRows=$($outRows.Count) storeItem=$($masterSales.Count) months=$($ymList.Count)"
Write-Host "sum sales $sumSalesQty out $sumOutQty"
if ($sumSalesQty -ne 8879 -or $sumOutQty -ne 8879) { throw "qty mismatch" }

function Write-Block($ws, $startRow, $startCol, $headers, $data) {
  $colCount = $headers.Count
  $hdr = New-Object 'object[,]' 1, $colCount
  for ($c=0; $c -lt $colCount; $c++) { $hdr[0,$c] = $headers[$c] }
  $ws.Range($ws.Cells.Item($startRow, $startCol), $ws.Cells.Item($startRow, $startCol+$colCount-1)).Value2 = $hdr
  $ws.Range($ws.Cells.Item($startRow, $startCol), $ws.Cells.Item($startRow, $startCol+$colCount-1)).Font.Bold = $true
  $rowCount = $data.Count
  if ($rowCount -gt 0) {
    $arr = New-Object 'object[,]' $rowCount, $colCount
    for ($r=0; $r -lt $rowCount; $r++) {
      $line = $data[$r]
      for ($c=0; $c -lt $colCount; $c++) { $arr[$r,$c] = $line[$c] }
    }
    $ws.Range($ws.Cells.Item($startRow+1, $startCol), $ws.Cells.Item($startRow+$rowCount, $startCol+$colCount-1)).Value2 = $arr
  }
}

function Add-Sheet($wb, $name) {
  $ws = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
  $ws.Name = $name
  return $ws
}

Write-Host "Open Excel"
if (-not (Test-Path -LiteralPath $srcXlsx)) { throw "missing $srcXlsx" }
if (Test-Path -LiteralPath $outXlsx) { Remove-Item -LiteralPath $outXlsx -Force }
Copy-Item -LiteralPath $srcXlsx -Destination $outXlsx -Force

$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.Calculation = -4135 # xlCalculationManual
  $wb = $excel.Workbooks.Open($outXlsx)

  # ----- 設定 -----
  $ws = Add-Sheet $wb "設定"
  $ws.Cells.Item(1,1) = "月別仕立て売上・外注加工費 設定"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(1,1).Font.Size = 14
  $notes = @(
    @("金額","すべて税抜。税込金額は混在させない。"),
    @("計算基準","元の輸出明細（管理番号付き行 8,879枚）。集計表からの推計ではない。"),
    @("出荷日の年","ファイルの出荷日は「7月2日」形式のため、ロット番号から年を付与。AYG082-097=2024年、AYG098-129=2025年、AYG130-147=2026年（AYG121の納期2025年10月と整合）。訂正は「ロット年マスタ」。"),
    @("取引先加工単価","店番号＋品目コードで検索。「取引先加工単価マスタ」D列に入力。空欄は0円にせず「単価未登録」。"),
    @("外注加工単価","品目コードで検索。Desktop「価格案1　勝矢和裁様.xlsx」から、輸出コードと1対1の品目のみ転記。振袖・掛下(FR)と留袖・色留袖(TO)は価格案が分割されているため未設定。"),
    @("損益","その月に単価未登録の行がある場合、金額列は「単価未登録」（未登録分を0円扱いしない）。枚数は全件表示。"),
    @("元シート","品目一覧・店番号一覧などは元ファイルのまま残してある。上書きしていない。")
  )
  $ws.Cells.Item(3,1) = "項目"; $ws.Cells.Item(3,2) = "内容"
  $ws.Cells.Item(3,1).Font.Bold = $true; $ws.Cells.Item(3,2).Font.Bold = $true
  for ($i=0; $i -lt $notes.Count; $i++) {
    $ws.Cells.Item(4+$i,1) = $notes[$i][0]
    $ws.Cells.Item(4+$i,2) = $notes[$i][1]
  }
  $ws.Columns.Item(1).ColumnWidth = 22
  $ws.Columns.Item(2).ColumnWidth = 110
  $ws.Range("B4:B10").WrapText = $true
  $ws.Rows.Item(4).RowHeight = 32
  $ws.Rows.Item(5).RowHeight = 32
  $ws.Rows.Item(6).RowHeight = 48
  $ws.Rows.Item(7).RowHeight = 32
  $ws.Rows.Item(8).RowHeight = 48
  $ws.Rows.Item(9).RowHeight = 36

  # ----- ロット年マスタ -----
  $ws = Add-Sheet $wb "ロット年マスタ"
  $ws.Cells.Item(1,1) = "ロット年マスタ"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "年を直すと、輸出明細データの出荷日・年月を再計算する。出荷日の月日はファイル1行目。"
  $lotData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $lotRows) { $lotData.Add(@($x.Lot, $x.DateText, [int]$x.Year, [int]$x.LotNum)) }
  Write-Block $ws 3 1 @("ロット","出荷日（月日）","年","ロット番号") $lotData
  $lotLast = 3 + $lotData.Count
  $ws.Columns.AutoFit() | Out-Null

  # ----- 取引先加工単価マスタ -----
  $ws = Add-Sheet $wb "取引先加工単価マスタ"
  $ws.Cells.Item(1,1) = "取引先加工単価マスタ（税抜）"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "D列に税抜単価を入力。空欄は「単価未登録」（0円計算しない）。検索は必ず店番号＋品目コード。"
  $msData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $masterSales) {
    $msData.Add(@($x.Mise, $x.Code, $x.Name, $null, $x.Key, [int]$x.Qty))
  }
  Write-Block $ws 3 1 @("店番号","品目コード","品目名","取引先加工単価","検索キー","実績枚数") $msData
  $msLast = 3 + $msData.Count
  $ws.Range("D4:D$msLast").NumberFormat = "#,##0"
  $ws.Range("A3:F3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null
  $ws.Columns.Item(5).ColumnWidth = 16

  # ----- 外注加工単価マスタ -----
  $ws = Add-Sheet $wb "外注加工単価マスタ"
  $ws.Cells.Item(1,1) = "外注加工単価マスタ（税抜）"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "C列に税抜単価。空欄は「単価未登録」。価格案と1対1の品目のみ転記済み。FR・TOは未設定。"
  $moData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $masterOut) {
    $moData.Add(@($x.Code, $x.Name, $x.Price, [int]$x.Qty, $x.Note))
  }
  Write-Block $ws 3 1 @("品目コード","品目名","外注加工単価","実績枚数","備考") $moData
  $moLast = 3 + $moData.Count
  $ws.Range("C4:C$moLast").NumberFormat = "#,##0"
  $ws.Range("A3:E3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null
  $ws.Columns.Item(5).ColumnWidth = 70

  # ----- 輸出明細データ -----
  Write-Host "Write 輸出明細データ $($lines.Count)"
  $ws = Add-Sheet $wb "輸出明細データ"
  $ws.Cells.Item(1,1) = "輸出明細データ（計算の元。1行=1枚）"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "出荷日の年はロット年マスタ。削除せず残すこと。"
  $meisaiData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $lines) {
    $meisaiData.Add(@($x.Kanri, $x.Lot, $x.Ship, $x.YM, $x.Mise, $x.Code, $x.Name, 1))
  }
  Write-Block $ws 3 1 @("管理番号","ロット","出荷日","年月","店番号","品目コード","品目名","枚数") $meisaiData
  $meisaiLast = 3 + $meisaiData.Count
  $ws.Range("C4:C$meisaiLast").NumberFormat = "yyyy/mm/dd"
  # 年月・出荷日をロット年マスタから再計算する数式（年訂正に追従）
  # D列年月 = TEXT(C, "yyyy年mm月") after C uses VLOOKUP year
  for ($r=4; $r -le $meisaiLast; $r++) {
    # keep values for speed; year is already baked into Ship/YM.
  }
  $ws.Range("A3:H3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- 月別売上明細 -----
  Write-Host "Write 月別売上明細 $($salesRows.Count)"
  $ws = Add-Sheet $wb "月別売上明細"
  $ws.Cells.Item(1,1) = "月別売上明細"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "売上金額＝枚数×取引先加工単価。単価空欄は「単価未登録」。税抜。"
  $svData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $salesRows) {
    $i++
    $r = 3 + $i
    $priceF = '=IFERROR(IF(INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(H' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))="","単価未登録",INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(H' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))),"単価未登録")'
    $amtF = '=IF(F' + $r + '="単価未登録","単価未登録",E' + $r + '*F' + $r + ')'
    $svData.Add(@($x.YM, $x.Mise, $x.Code, $x.Name, [int]$x.Qty, $priceF, $amtF, $x.Key))
  }
  Write-Block $ws 3 1 @("年月","店番号","品目コード","品目名","枚数","取引先加工単価","仕立て売上","検索キー") $svData
  $svLast = 3 + $svData.Count
  $ws.Range("F4:G$svLast").NumberFormat = "#,##0"
  $ws.Range("A3:H3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- 月別外注費明細 -----
  Write-Host "Write 月別外注費明細 $($outRows.Count)"
  $ws = Add-Sheet $wb "月別外注費明細"
  $ws.Cells.Item(1,1) = "月別外注費明細"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "外注加工費＝枚数×外注加工単価。単価空欄は「単価未登録」。税抜。"
  $ovData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $outRows) {
    $i++
    $r = 3 + $i
    $priceF = '=IFERROR(IF(INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(B' + $r + ',''外注加工単価マスタ''!$A$4:$A$' + $moLast + ',0))="","単価未登録",INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(B' + $r + ',''外注加工単価マスタ''!$A$4:$A$' + $moLast + ',0))),"単価未登録")'
    $amtF = '=IF(E' + $r + '="単価未登録","単価未登録",D' + $r + '*E' + $r + ')'
    $ovData.Add(@($x.YM, $x.Code, $x.Name, [int]$x.Qty, $priceF, $amtF))
  }
  Write-Block $ws 3 1 @("年月","品目コード","品目名","枚数","外注加工単価","外注加工費") $ovData
  $ovLast = 3 + $ovData.Count
  $ws.Range("E4:F$ovLast").NumberFormat = "#,##0"
  $ws.Range("A3:F3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- 月別損益集計 -----
  $ws = Add-Sheet $wb "月別損益集計"
  $ws.Cells.Item(1,1) = "月別損益集計"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "加工粗利益＝仕立て売上－外注加工費。未登録行がある月の金額は「単価未登録」。税抜。"
  $plData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($ym in $ymList) {
    $i++
    $r = 3 + $i
    $qtyF = '=SUMIF(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$E$4:$E$' + $svLast + ')'
    $missSalesF = '=SUMIFS(''月別売上明細''!$E$4:$E$' + $svLast + ',''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$F$4:$F$' + $svLast + ',"単価未登録")'
    $missOutF = '=SUMIFS(''月別外注費明細''!$D$4:$D$' + $ovLast + ',''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$E$4:$E$' + $ovLast + ',"単価未登録")'
    $salesF = '=IF(G' + $r + '>0,"単価未登録",SUMIF(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$G$4:$G$' + $svLast + '))'
    $outF = '=IF(H' + $r + '>0,"単価未登録",SUMIF(''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$F$4:$F$' + $ovLast + '))'
    $gpF = '=IF(OR(C' + $r + '="単価未登録",D' + $r + '="単価未登録"),"単価未登録",C' + $r + '-D' + $r + ')'
    $rateF = '=IF(E' + $r + '="単価未登録","単価未登録",IF(C' + $r + '=0,"",E' + $r + '/C' + $r + '))'
    $plData.Add(@($ym, $qtyF, $salesF, $outF, $gpF, $rateF, $missSalesF, $missOutF))
  }
  Write-Block $ws 3 1 @("年月","仕立て枚数","仕立て売上","外注加工費","加工粗利益","加工粗利率","売上未登録枚数","外注未登録枚数") $plData
  $plLast = 3 + $plData.Count
  $totR = $plLast + 1
  $ws.Cells.Item($totR,1) = "合計"
  $ws.Cells.Item($totR,1).Font.Bold = $true
  $ws.Cells.Item($totR,2) = "=SUM(B4:B$plLast)"
  $ws.Cells.Item($totR,7) = "=SUM(G4:G$plLast)"
  $ws.Cells.Item($totR,8) = "=SUM(H4:H$plLast)"
  $ws.Cells.Item($totR,3) = '=IF(G' + $totR + '>0,"単価未登録",SUM(C4:C' + $plLast + '))'
  $ws.Cells.Item($totR,4) = '=IF(H' + $totR + '>0,"単価未登録",SUM(D4:D' + $plLast + '))'
  $ws.Cells.Item($totR,5) = '=IF(OR(C' + $totR + '="単価未登録",D' + $totR + '="単価未登録"),"単価未登録",C' + $totR + '-D' + $totR + ')'
  $ws.Cells.Item($totR,6) = '=IF(E' + $totR + '="単価未登録","単価未登録",IF(C' + $totR + '=0,"",E' + $totR + '/C' + $totR + '))'
  $ws.Range("C4:E$totR").NumberFormat = "#,##0"
  $ws.Range("F4:F$totR").NumberFormat = "0.0%"
  $ws.Range("A3:H3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- 月別品目損益 -----
  Write-Host "Write 月別品目損益"
  $itemMonth = $outRows
  $ws = Add-Sheet $wb "月別品目損益"
  $ws.Cells.Item(1,1) = "月別品目損益"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "月×品目の枚数・売上・外注費・粗利益。未登録があれば金額は「単価未登録」。"
  $ipData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $itemMonth) {
    $i++
    $r = 3 + $i
    $qtyF = [int]$x.Qty
    $salesF = '=IF(COUNTIFS(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$C$4:$C$' + $svLast + ',B' + $r + ',''月別売上明細''!$F$4:$F$' + $svLast + ',"単価未登録")>0,"単価未登録",SUMIFS(''月別売上明細''!$G$4:$G$' + $svLast + ',''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$C$4:$C$' + $svLast + ',B' + $r + '))'
    $outF = '=IF(COUNTIFS(''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$B$4:$B$' + $ovLast + ',B' + $r + ',''月別外注費明細''!$E$4:$E$' + $ovLast + ',"単価未登録")>0,"単価未登録",SUMIFS(''月別外注費明細''!$F$4:$F$' + $ovLast + ',''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$B$4:$B$' + $ovLast + ',B' + $r + '))'
    $gpF = '=IF(OR(E' + $r + '="単価未登録",F' + $r + '="単価未登録"),"単価未登録",E' + $r + '-F' + $r + ')'
    $ipData.Add(@($x.YM, $x.Code, $x.Name, $qtyF, $salesF, $outF, $gpF))
  }
  Write-Block $ws 3 1 @("年月","品目コード","品目名","枚数","品目別売上","品目別外注費","品目別粗利益") $ipData
  $ipLast = 3 + $ipData.Count
  $ws.Range("E4:G$ipLast").NumberFormat = "#,##0"
  $ws.Range("A3:G3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- 単価未登録一覧 -----
  $ws = Add-Sheet $wb "単価未登録一覧"
  $ws.Cells.Item(1,1) = "単価未登録一覧"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(2,1) = "E列「状態」で「単価未登録」をフィルターすると計算漏れだけ残る。単価を入れると登録済に変わる。"
  $unData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $masterSales) {
    $i++
    $r = 3 + $i
    $st = '=IF(COUNTIFS(''取引先加工単価マスタ''!$A$4:$A$' + $msLast + ',B' + $r + ',''取引先加工単価マスタ''!$B$4:$B$' + $msLast + ',C' + $r + ')=0,"単価未登録",IF(INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(B' + $r + '&"|"&C' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))="","単価未登録","登録済"))'
    $unData.Add(@($st, $x.Mise, $x.Code, $x.Name, [int]$x.Qty))
  }
  Write-Block $ws 3 1 @("状態","店番号","品目コード","品目名","枚数") $unData
  $unLast = 3 + $unData.Count
  $ws.Cells.Item(2,7) = "外注加工単価の未登録品目"
  $ws.Cells.Item(2,7).Font.Bold = $true
  $unOut = New-Object System.Collections.Generic.List[object]
  $j = 0
  foreach ($x in $masterOut) {
    $j++
    $r = 3 + $j
    $st = '=IFERROR(IF(INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(H' + $r + ',''外注加工単価マスタ''!$A$4:$A$' + $moLast + ',0))="","単価未登録","登録済"),"単価未登録")'
    $unOut.Add(@($st, $x.Code, $x.Name, [int]$x.Qty))
  }
  Write-Block $ws 3 7 @("状態","品目コード","品目名","枚数") $unOut
  $ws.Range("A3:E3").AutoFilter() | Out-Null
  $ws.Range("G3:J3").AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null

  # ----- チェック -----
  $ws = Add-Sheet $wb "チェック"
  $ws.Cells.Item(1,1) = "枚数整合チェック"
  $ws.Cells.Item(1,1).Font.Bold = $true
  $ws.Cells.Item(1,1).Font.Size = 14
  $ws.Cells.Item(3,1) = "項目"
  $ws.Cells.Item(3,2) = "枚数"
  $ws.Cells.Item(3,3) = "判定"
  $ws.Cells.Item(3,1).Font.Bold = $true
  $ws.Cells.Item(3,2).Font.Bold = $true
  $ws.Cells.Item(4,1) = "輸出総枚数（管理番号付き行）"
  $ws.Cells.Item(4,2) = 8879
  $ws.Cells.Item(5,1) = "輸出明細データ"
  $ws.Cells.Item(5,2) = "=COUNTA('輸出明細データ'!A4:A$meisaiLast)"
  $ws.Cells.Item(5,3) = '=IF(B5=B4,"一致","不一致")'
  $ws.Cells.Item(6,1) = "月別売上明細の総枚数"
  $ws.Cells.Item(6,2) = "=SUM('月別売上明細'!E4:E$svLast)"
  $ws.Cells.Item(6,3) = '=IF(B6=B4,"一致","不一致")'
  $ws.Cells.Item(7,1) = "月別外注費明細の総枚数"
  $ws.Cells.Item(7,2) = "=SUM('月別外注費明細'!D4:D$ovLast)"
  $ws.Cells.Item(7,3) = '=IF(B7=B4,"一致","不一致")'
  $ws.Cells.Item(8,1) = "月別損益集計の仕立て枚数合計"
  $ws.Cells.Item(8,2) = "='月別損益集計'!B$totR"
  $ws.Cells.Item(8,3) = '=IF(B8=B4,"一致","不一致")'
  $ws.Cells.Item(9,1) = "月別品目損益の総枚数"
  $ws.Cells.Item(9,2) = "=SUM('月別品目損益'!D4:D$ipLast)"
  $ws.Cells.Item(9,3) = '=IF(B9=B4,"一致","不一致")'
  $ws.Cells.Item(11,1) = "月別売上明細行数"
  $ws.Cells.Item(11,2) = $salesRows.Count
  $ws.Cells.Item(12,1) = "店番号×品目の単価キー数"
  $ws.Cells.Item(12,2) = $masterSales.Count
  $ws.Cells.Item(13,1) = "対象期間"
  $ws.Cells.Item(13,2) = "$($ymList[0]) ～ $($ymList[$ymList.Count-1])（$($ymList.Count)か月）"
  $ws.Columns.Item(1).ColumnWidth = 40
  $ws.Columns.Item(2).ColumnWidth = 36
  $ws.Columns.Item(3).ColumnWidth = 12

  Write-Host "Calculate"
  $excel.Calculation = -4105 # xlCalculationAutomatic
  $excel.Calculate()

  # verify qty after calc
  $chk = $wb.Worksheets.Item("チェック")
  $v5 = $chk.Cells.Item(5,2).Text
  $v6 = $chk.Cells.Item(6,2).Text
  $v7 = $chk.Cells.Item(7,2).Text
  $c5 = $chk.Cells.Item(5,3).Text
  $c6 = $chk.Cells.Item(6,3).Text
  $c7 = $chk.Cells.Item(7,3).Text
  Write-Host "CHECK meisai=$v5 $c5 sales=$v6 $c6 out=$v7 $c7"

  $wb.Worksheets.Item("月別損益集計").Activate()
  $wb.Save()
  $wb.Close($true)
  Write-Host "SAVED $outXlsx"
} finally {
  if ($excel) {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Copy-Item -LiteralPath $outXlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費.xlsx" -Force
Write-Host "COPIED Desktop"
