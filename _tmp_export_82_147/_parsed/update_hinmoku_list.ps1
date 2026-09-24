$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$detailsPath = "C:\CAYANAS_Print_v2\_tmp_export_82_147\_parsed\details.csv"
$xlsx = "C:\Users\user\Downloads\輸出明細82-147_月別仕立て売上と外注加工費.xlsx"

function Get-LotFromFile([string]$file) {
  if ($file -match 'AYG(\d{3})') { return 'AYG' + $Matches[1] }
  return ''
}
function Get-ItemKey([string]$code, [string]$mise) {
  if ($code -eq 'FR') {
    if ($mise -eq 'A700') { return @{ Code='FR'; Name='掛下（A700）'; Sort=2 } }
    return @{ Code='FR'; Name='振袖'; Sort=1 }
  }
  $names = @{
    TO='留袖・色留袖'; HM='訪問着'; TK='附下'; MW='喪服　冬'; MS='喪服　夏'
    KM='小紋'; IR='色無地'; TM='紬'; CO='コート'; HA='羽織'; NA='長襦袢'; NF='長襦袢.振袖'
    YK='浴衣'; MK='紳士着物'; MH='紳士羽織'; '2K'='二部式着物'
    CK='子供着物'; CJ='子供襦袢'; UC='打掛・白無垢'; UE='打掛（刺繍用）'
  }
  $order = @{
    TO=0; HM=3; TK=4; MW=5; MS=6; KM=7; IR=8; TM=9; CO=10; HA=11
    NA=12; NF=13; YK=14; MK=15; MH=16; '2K'=17; CK=18; CJ=19; UC=20; UE=21
  }
  if ($names.ContainsKey($code)) {
    return @{ Code=$code; Name=$names[$code]; Sort=[int]$order[$code] }
  }
  return $null
}

$d = @(Import-Csv -LiteralPath $detailsPath)
$agg = @{}
$lotAgg = @{}
$lots = @()
for ($n=82; $n -le 147; $n++) { $lots += ('AYG{0:D3}' -f $n) }

foreach ($row in $d) {
  $info = Get-ItemKey $row.Hinmoku $row.Mise
  if (-not $info) { throw "unexpected code $($row.Hinmoku) $($row.Kanri)" }
  $k = $info.Name
  if (-not $agg.ContainsKey($k)) {
    $agg[$k] = @{ Code=$info.Code; Name=$info.Name; Sort=$info.Sort; S=0; P=0; C=0; O=0; T=0 }
  }
  $agg[$k].T++
  switch ($row.Zai) {
    'S' { $agg[$k].S++ }
    'P' { $agg[$k].P++ }
    'C' { $agg[$k].C++ }
    default { $agg[$k].O++ }
  }
  $lot = Get-LotFromFile $row.File
  $lk = "$k`t$lot"
  if (-not $lotAgg.ContainsKey($lk)) { $lotAgg[$lk] = 0 }
  $lotAgg[$lk]++
}

$rows = $agg.Values | Sort-Object Sort, Name
$total = 8879
Write-Host ("items={0} sum={1}" -f @($rows).Count, (($rows | ForEach-Object { $_.T } | Measure-Object -Sum).Sum))
$rows | ForEach-Object { Write-Host ("{0}`t{1}`t{2}" -f $_.Name, $_.Code, $_.T) }

function Write-Block($ws, $startRow, $startCol, $headers, $data) {
  $colCount = $headers.Count
  $hdr = New-Object 'object[,]' 1, $colCount
  for ($c=0; $c -lt $colCount; $c++) { $hdr[0,$c] = $headers[$c] }
  $ws.Range($ws.Cells.Item($startRow,$startCol), $ws.Cells.Item($startRow,$startCol+$colCount-1)).Value2 = $hdr
  $ws.Range($ws.Cells.Item($startRow,$startCol), $ws.Cells.Item($startRow,$startCol+$colCount-1)).Font.Bold = $true
  $n = $data.Count
  $arr = New-Object 'object[,]' $n, $colCount
  for ($r=0; $r -lt $n; $r++) {
    $line = $data[$r]
    for ($c=0; $c -lt $colCount; $c++) { $arr[$r,$c] = $line[$c] }
  }
  $ws.Range($ws.Cells.Item($startRow+1,$startCol), $ws.Cells.Item($startRow+$n,$startCol+$colCount-1)).Value2 = $arr
}

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($xlsx)

  $ws = $wb.Worksheets.Item('品目一覧')
  $ws.Cells.Item(1,1) = '品目集計一覧'
  $ws.Cells.Item(2,1) = '振袖と掛下を分割。掛下（A700）は店番号A700のFRのみ。不明5件は正しい品目へ修正済み。s=材質S、p=材質P。'
  $ws.Range('A3:H40').Clear() | Out-Null
  $list = New-Object System.Collections.Generic.List[object]
  $sumS=0; $sumP=0; $sumC=0; $sumO=0; $sumT=0
  foreach ($x in $rows) {
    $sumS += $x.S; $sumP += $x.P; $sumC += $x.C; $sumO += $x.O; $sumT += $x.T
    $list.Add(@($x.Name, $x.Code, $x.S, $x.P, $x.C, $x.O, $x.T, [double]($x.T / $total)))
  }
  $list.Add(@('合計','', $sumS, $sumP, $sumC, $sumO, $sumT, 1.0))
  Write-Block $ws 3 1 @('品目','コード','s枚数','p枚数','C','その他','合計','構成比') $list
  $last = 3 + $list.Count
  $ws.Range("H4:H$last").NumberFormat = '0.0%'
  $ws.Range("C4:G$last").NumberFormat = '#,##0'
  $ws.Range("A$last`:H$last").Font.Bold = $true
  $ws.Range('A3:H3').AutoFilter() | Out-Null
  $ws.Columns.AutoFit() | Out-Null
  Write-Host ("品目一覧 last=$last sumT=$sumT")

  $hl = $wb.Worksheets.Item('品目×ロット')
  $hl.Cells.Item(1,1) = '品目 × ロット'
  $hl.Cells.Item(2,1) = '振袖と掛下（A700）を分割。不明5件は正しい品目へ修正済み。'
  $hl.UsedRange.Clear() | Out-Null
  $hl.Cells.Item(1,1) = '品目 × ロット'
  $hl.Cells.Item(2,1) = '振袖と掛下（A700）を分割。不明5件は正しい品目へ修正済み。'
  $headers = @('品目','コード') + $lots + @('合計')
  $hlData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $rows) {
    $line = New-Object System.Collections.Generic.List[object]
    $line.Add($x.Name); $line.Add($x.Code)
    $rowSum = 0
    foreach ($lot in $lots) {
      $k = "$($x.Name)`t$lot"
      $n = 0
      if ($lotAgg.ContainsKey($k)) { $n = [int]$lotAgg[$k] }
      $line.Add($n)
      $rowSum += $n
    }
    $line.Add($rowSum)
    $hlData.Add($line.ToArray())
  }
  $tot = New-Object System.Collections.Generic.List[object]
  $tot.Add('合計'); $tot.Add('')
  $grand = 0
  foreach ($lot in $lots) {
    $s = 0
    foreach ($x in $rows) {
      $k = "$($x.Name)`t$lot"
      if ($lotAgg.ContainsKey($k)) { $s += [int]$lotAgg[$k] }
    }
    $tot.Add($s); $grand += $s
  }
  $tot.Add($grand)
  $hlData.Add($tot.ToArray())
  Write-Block $hl 3 1 $headers $hlData
  $hlLast = 3 + $hlData.Count
  $hl.Range($hl.Cells.Item($hlLast,1), $hl.Cells.Item($hlLast, $headers.Count)).Font.Bold = $true
  $hl.Range($hl.Cells.Item(3,1), $hl.Cells.Item(3, $headers.Count)).AutoFilter() | Out-Null
  $hl.Columns.AutoFit() | Out-Null
  Write-Host "品目×ロット grand=$grand"

  $wb.Save()
  $wb.Close($true)
  Write-Host SAVED
} finally {
  if ($excel) { $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

try {
  Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費_品目訂正.xlsx" -Force
  Write-Host copied
} catch {
  Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_品目一覧更新.xlsx" -Force
  Write-Host copied-alt
}
