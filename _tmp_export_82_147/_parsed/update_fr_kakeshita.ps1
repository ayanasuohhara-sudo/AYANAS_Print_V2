$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$detailsPath = "C:\CAYANAS_Print_v2\_tmp_export_82_147\_parsed\details.csv"
$xlsx = "C:\Users\user\Downloads\輸出明細82-147_月別仕立て売上と外注加工費.xlsx"

$nameMap = [ordered]@{
  TO='留袖・色留袖'; HM='訪問着'; TK='附下'; MW='喪服　冬'; MS='喪服　夏'
  KM='小紋'; IR='色無地'; TM='紬'; CO='コート'; HA='羽織'; NA='長襦袢'; NF='長襦袢.振袖'
  YK='浴衣'; MK='紳士着物'; MH='紳士羽織'; MY='紳士浴衣'; '2K'='二部式着物'; '2J'='二部式襦袢'
  CK='子供着物'; CJ='子供襦袢'; UC='打掛・白無垢'; UE='打掛（刺繍用）'; TE='留袖（刺繍用）'
  C0='コート（C0）'; CH='CH（不明）'; WS='WS（不明）'; TN='TN（不明）'; HN='HN（不明）'
}

$outsourcePriceByName = @{
  '訪問着' = 11500; '附下' = 11500; '小紋' = 10700; '色無地' = 10700; '紬' = 10700
  '長襦袢' = 8000; '長襦袢.振袖' = 8500; '羽織' = 10700; 'コート' = 10700
  '喪服　冬' = 12000; '喪服　夏' = 11000; '紳士着物' = 11500; '紳士羽織' = 11500
  '二部式着物' = 13500; '二部式襦袢' = 11000; '打掛・白無垢' = 18000
  '振袖' = 11500; '掛下' = 16000
}

function Get-ItemName([string]$code, [string]$mise) {
  if ($code -eq 'FR') {
    if ($mise -eq 'A700') { return '掛下' }
    return '振袖'
  }
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
function Write-Col($ws, $col, $startRow, [string[]]$values) {
  $n = $values.Count
  $arr = New-Object 'object[,]' $n, 1
  for ($i=0; $i -lt $n; $i++) { $arr[$i,0] = $values[$i] }
  $rng = $ws.Range($ws.Cells.Item($startRow,$col), $ws.Cells.Item($startRow+$n-1,$col))
  $rng.NumberFormat = '@'
  $rng.Value2 = $arr
}
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

Write-Host 'Load details'
$details = @(Import-Csv -LiteralPath $detailsPath)
$meisaiNames = New-Object System.Collections.Generic.List[string]
$salesName = @{}
$outAgg = @{}
$itemQty = @{}
$storeItemName = @{}

foreach ($row in $details) {
  $lot = Get-LotFromFile $row.File
  $null = $lot -match 'AYG(\d{3})'
  $year = Get-YearFromLotNum ([int]$Matches[1])
  $null = $row.Date -match '(\d{1,2})月(\d{1,2})日'
  $ym = '{0}年{1:D2}月' -f $year, ([int]$Matches[1])
  $code = [string]$row.Hinmoku
  $mise = [string]$row.Mise
  $name = Get-ItemName $code $mise
  $meisaiNames.Add($name)
  $sk = "$ym`t$mise`t$code"
  $salesName[$sk] = $name
  $ok = "$ym`t$code`t$name"
  if (-not $outAgg.ContainsKey($ok)) { $outAgg[$ok] = 0 }
  $outAgg[$ok]++
  $ik = "$code`t$name"
  if (-not $itemQty.ContainsKey($ik)) { $itemQty[$ik] = 0 }
  $itemQty[$ik]++
  $sik = "$mise`t$code"
  $storeItemName[$sik] = $name
}

$salesRows = $salesName.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Mise=$p[1]; Hin=$p[2]; Name=$_.Value }
} | Sort-Object YM, Mise, Hin

$outRows = $outAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Hin=$p[1]; Name=$p[2]; Qty=[int]$_.Value }
} | Sort-Object YM, Hin, Name

Write-Host ("meisai={0} sales={1} outRows={2} outQty={3}" -f $meisaiNames.Count, $salesRows.Count, $outRows.Count, (($outRows | Measure-Object Qty -Sum).Sum))

$masterOut = New-Object System.Collections.Generic.List[object]
# FR first as two named items, then other codes
$masterOut.Add(@('FR','振袖',11500, [int]$itemQty['FR	振袖'], '店番号A700以外。価格案の振袖11,500'))
$masterOut.Add(@('FR','掛下',16000, [int]$itemQty['FR	掛下'], '店番号A700のみ。価格案の掛下16,000'))
foreach ($code in $nameMap.Keys) {
  $nm = [string]$nameMap[$code]
  $qty = 0
  $ik = "$code`t$nm"
  if ($itemQty.ContainsKey($ik)) { $qty = [int]$itemQty[$ik] }
  $price = $null
  if ($outsourcePriceByName.ContainsKey($nm)) { $price = [int]$outsourcePriceByName[$nm] }
  $note = ''
  if ($code -eq 'TO') { $note = '価格案は留袖比翼13,000／色留袖12,000。輸出品目は「留袖・色留袖」のため未設定' }
  elseif ($price) { $note = '価格案1　勝矢和裁様（1対1対応）' }
  elseif ($nm -eq '浴衣') { $note = '価格案に浴衣なし' }
  elseif ($nm -eq '子供着物') { $note = '価格案に子供着物なし' }
  elseif ($nm -eq '子供襦袢') { $note = '価格案に子供襦袢なし' }
  elseif ($nm -eq '打掛（刺繍用）') { $note = '価格案に打掛（刺繍用）なし' }
  elseif ($nm -eq '留袖（刺繍用）') { $note = '価格案に留袖（刺繍用）なし' }
  elseif ($nm -eq '紳士浴衣') { $note = '価格案に紳士浴衣なし' }
  elseif ($code -eq 'C0') { $note = '品目コードC0（COの誤記の可能性）' }
  elseif ($code -in @('CH','WS','TN','HN')) { $note = '不明コード' }
  $masterOut.Add(@($code, $nm, $price, $qty, $note))
}
$moLast = 3 + $masterOut.Count

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.Calculation = -4135
  $wb = $excel.Workbooks.Open($xlsx)

  # 設定メモ追記
  $st = $wb.Worksheets.Item('設定')
  $st.Cells.Item(11,1) = 'FRの区分'
  $st.Cells.Item(11,2) = '店番号A700のFRは掛下（外注16,000）。それ以外の店番号のFRは振袖（外注11,500）。'

  # 輸出明細データ 品目名
  Write-Host 'Update 輸出明細データ 品目名'
  $me = $wb.Worksheets.Item('輸出明細データ')
  Write-Col $me 7 4 @($meisaiNames)

  # 月別売上明細 品目名
  Write-Host 'Update 月別売上明細 品目名'
  $sv = $wb.Worksheets.Item('月別売上明細')
  $svLast = $sv.UsedRange.Rows.Count
  Write-Col $sv 4 4 @($salesRows | ForEach-Object { $_.Name })

  # 取引先加工単価マスタ 品目名
  $ms = $wb.Worksheets.Item('取引先加工単価マスタ')
  $msLast = $ms.UsedRange.Rows.Count
  $msNames = New-Object System.Collections.Generic.List[string]
  for ($r=4; $r -le $msLast; $r++) {
    $mise = [string]$ms.Cells.Item($r,1).Value2
    $code = [string]$ms.Cells.Item($r,2).Value2
    $msNames.Add((Get-ItemName $code $mise))
  }
  Write-Col $ms 3 4 @($msNames)

  # 単価未登録一覧 左の品目名
  $un = $wb.Worksheets.Item('単価未登録一覧')
  $unLastLeft = 3
  while ($un.Cells.Item($unLastLeft+1,2).Value2) { $unLastLeft++ }
  $unNames = New-Object System.Collections.Generic.List[string]
  for ($r=4; $r -le $unLastLeft; $r++) {
    $mise = [string]$un.Cells.Item($r,2).Value2
    $code = [string]$un.Cells.Item($r,3).Value2
    $unNames.Add((Get-ItemName $code $mise))
  }
  Write-Col $un 4 4 @($unNames)

  # 外注加工単価マスタ 作り直し
  Write-Host 'Rewrite 外注加工単価マスタ'
  $mo = $wb.Worksheets.Item('外注加工単価マスタ')
  $mo.Cells.Item(2,1) = 'C列に税抜単価。空欄は「単価未登録」。FRは店番号で掛下/振袖に分割。検索キー=品目コード|品目名。'
  $mo.Range('A3:F200').Clear() | Out-Null
  $moKeys = New-Object System.Collections.Generic.List[object]
  foreach ($row in $masterOut) {
    $key = [string]$row[0] + '|' + [string]$row[1]
    $moKeys.Add(@($row[0], $row[1], $row[2], $row[3], $row[4], $key))
  }
  Write-Block $mo 3 1 @('品目コード','品目名','外注加工単価','実績枚数','備考','検索キー') $moKeys
  $mo.Range("C4:C$moLast").NumberFormat = '#,##0'
  $mo.Range('A3:F3').AutoFilter() | Out-Null
  $mo.Columns.AutoFit() | Out-Null
  $mo.Columns.Item(5).ColumnWidth = 70

  # 月別外注費明細 作り直し
  Write-Host ("Rewrite 月別外注費明細 {0}" -f $outRows.Count)
  $ov = $wb.Worksheets.Item('月別外注費明細')
  $ov.Range('A3:F500').Clear() | Out-Null
  $ovData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $outRows) {
    $i++
    $r = 3 + $i
    $keyF = [string]$x.Hin + '|' + [string]$x.Name
    $priceF = '=IFERROR(IF(INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(G' + $r + ',''外注加工単価マスタ''!$F$4:$F$' + $moLast + ',0))="","単価未登録",INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(G' + $r + ',''外注加工単価マスタ''!$F$4:$F$' + $moLast + ',0))),"単価未登録")'
    $amtF = '=IF(E' + $r + '="単価未登録","単価未登録",D' + $r + '*E' + $r + ')'
    $ovData.Add(@($x.YM, $x.Hin, $x.Name, [int]$x.Qty, $priceF, $amtF, $keyF))
  }
  Write-Block $ov 3 1 @('年月','品目コード','品目名','枚数','外注加工単価','外注加工費','検索キー') $ovData
  $ovLast = 3 + $ovData.Count
  Write-Col $ov 1 4 @($outRows | ForEach-Object { $_.YM })
  Write-Col $ov 2 4 @($outRows | ForEach-Object { $_.Hin })
  Write-Col $ov 3 4 @($outRows | ForEach-Object { $_.Name })
  $ov.Range("E4:F$ovLast").NumberFormat = '#,##0'
  $ov.Range('A3:G3').AutoFilter() | Out-Null
  $ov.Columns.AutoFit() | Out-Null
  $ov.Cells.Item(2,1) = '外注加工費＝枚数×外注加工単価。FRはA700=掛下16,000、その他=振袖11,500。空欄は単価未登録。税抜。'

  # 月別品目損益 作り直し
  Write-Host 'Rewrite 月別品目損益'
  $ip = $wb.Worksheets.Item('月別品目損益')
  $ip.Range('A3:G500').Clear() | Out-Null
  $ipData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $outRows) {
    $i++
    $r = 3 + $i
    $salesF = '=IF(COUNTIFS(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$C$4:$C$' + $svLast + ',B' + $r + ',''月別売上明細''!$D$4:$D$' + $svLast + ',C' + $r + ',''月別売上明細''!$F$4:$F$' + $svLast + ',"単価未登録")>0,"単価未登録",SUMIFS(''月別売上明細''!$G$4:$G$' + $svLast + ',''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$C$4:$C$' + $svLast + ',B' + $r + ',''月別売上明細''!$D$4:$D$' + $svLast + ',C' + $r + '))'
    $outF = '=IF(COUNTIFS(''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$B$4:$B$' + $ovLast + ',B' + $r + ',''月別外注費明細''!$C$4:$C$' + $ovLast + ',C' + $r + ',''月別外注費明細''!$E$4:$E$' + $ovLast + ',"単価未登録")>0,"単価未登録",SUMIFS(''月別外注費明細''!$F$4:$F$' + $ovLast + ',''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$B$4:$B$' + $ovLast + ',B' + $r + ',''月別外注費明細''!$C$4:$C$' + $ovLast + ',C' + $r + '))'
    $gpF = '=IF(OR(E' + $r + '="単価未登録",F' + $r + '="単価未登録"),"単価未登録",E' + $r + '-F' + $r + ')'
    $ipData.Add(@($x.YM, $x.Hin, $x.Name, [int]$x.Qty, $salesF, $outF, $gpF))
  }
  Write-Block $ip 3 1 @('年月','品目コード','品目名','枚数','品目別売上','品目別外注費','品目別粗利益') $ipData
  $ipLast = 3 + $ipData.Count
  Write-Col $ip 1 4 @($outRows | ForEach-Object { $_.YM })
  Write-Col $ip 2 4 @($outRows | ForEach-Object { $_.Hin })
  Write-Col $ip 3 4 @($outRows | ForEach-Object { $_.Name })
  $ip.Range("E4:G$ipLast").NumberFormat = '#,##0'
  $ip.Range('A3:G3').AutoFilter() | Out-Null
  $ip.Columns.AutoFit() | Out-Null

  # 月別損益集計 外注範囲を更新
  $pl = $wb.Worksheets.Item('月別損益集計')
  $plLast = 28
  for ($r=4; $r -le $plLast; $r++) {
    $pl.Cells.Item($r,4).Formula = '=IF(H' + $r + '>0,"単価未登録",SUMIF(''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$F$4:$F$' + $ovLast + '))'
    $pl.Cells.Item($r,8).Formula = '=SUMIFS(''月別外注費明細''!$D$4:$D$' + $ovLast + ',''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$E$4:$E$' + $ovLast + ',"単価未登録")'
  }

  # チェック 外注・品目損益範囲
  $chk = $wb.Worksheets.Item('チェック')
  $chk.Cells.Item(7,2).Formula = "=SUM('月別外注費明細'!D4:D$ovLast)"
  $chk.Cells.Item(9,2).Formula = "=SUM('月別品目損益'!D4:D$ipLast)"

  # 単価未登録一覧 右側（外注）作り直し
  $un.Range('G2:J80').Clear() | Out-Null
  $un.Cells.Item(2,7) = '外注加工単価の未登録品目（FRは振袖/掛下に分割）'
  $un.Cells.Item(2,7).Font.Bold = $true
  $unOut = New-Object System.Collections.Generic.List[object]
  $j = 0
  foreach ($row in $masterOut) {
    $j++
    $r = 3 + $j
    $st = '=IFERROR(IF(INDEX(''外注加工単価マスタ''!$C$4:$C$' + $moLast + ',MATCH(H' + $r + '&"|"&I' + $r + ',''外注加工単価マスタ''!$F$4:$F$' + $moLast + ',0))="","単価未登録","登録済"),"単価未登録")'
    $unOut.Add(@($st, [string]$row[0], [string]$row[1], [int]$row[3]))
  }
  Write-Block $un 3 7 @('状態','品目コード','品目名','枚数') $unOut
  Write-Col $un 8 4 @($masterOut | ForEach-Object { [string]$_[0] })
  Write-Col $un 9 4 @($masterOut | ForEach-Object { [string]$_[1] })

  $excel.Calculation = -4105
  $excel.Calculate()

  for ($r=4; $r -le 9; $r++) {
    Write-Host ("CHK {0} | {1} | {2}" -f $chk.Cells.Item($r,1).Text, $chk.Cells.Item($r,2).Text, $chk.Cells.Item($r,3).Text)
  }
  Write-Host ("PL tot: " + ((1..8 | ForEach-Object { $pl.Cells.Item(29,$_).Text }) -join ' | '))
  Write-Host ("OV FR sample:")
  $shown = 0
  for ($r=4; $r -le $ovLast; $r++) {
    if ($ov.Cells.Item($r,2).Text -eq 'FR') {
      Write-Host ((1..6 | ForEach-Object { $ov.Cells.Item($r,$_).Text }) -join ' | ')
      $shown++
      if ($shown -ge 6) { break }
    }
  }

  $wb.Save()
  $wb.Close($true)
  Write-Host SAVED
} finally {
  if ($excel) { $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費_完成.xlsx" -Force
Write-Host DONE
