$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$detailsPath = "C:\CAYANAS_Print_v2\_tmp_export_82_147\_parsed\details.csv"
$xlsx = "C:\Users\user\Downloads\輸出明細82-147_月別仕立て売上と外注加工費.xlsx"

$fixByKanri = @{
  '06080293' = 'HA'  # 羽織
  '06120039' = 'MS'  # 喪服夏
  '08010174' = 'TM'  # 紬
  '08020357' = 'HM'  # 訪問着
  '08040510' = 'CO'  # コート
}

$nameMap = [ordered]@{
  TO='留袖・色留袖'; HM='訪問着'; TK='附下'; MW='喪服　冬'; MS='喪服　夏'
  KM='小紋'; IR='色無地'; TM='紬'; CO='コート'; HA='羽織'; NA='長襦袢'; NF='長襦袢.振袖'
  YK='浴衣'; MK='紳士着物'; MH='紳士羽織'; MY='紳士浴衣'; '2K'='二部式着物'; '2J'='二部式襦袢'
  CK='子供着物'; CJ='子供襦袢'; UC='打掛・白無垢'; UE='打掛（刺繍用）'; TE='留袖（刺繍用）'
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
function Write-Col($ws, $col, $startRow, $values) {
  $list = @($values)
  $n = $list.Count
  $arr = New-Object 'object[,]' $n, 1
  for ($i=0; $i -lt $n; $i++) { $arr[$i,0] = $list[$i] }
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

Write-Host 'Load and correct details'
$details = @(Import-Csv -LiteralPath $detailsPath)
$fixed = 0
foreach ($row in $details) {
  $id = [string]$row.Kanri
  if ($fixByKanri.ContainsKey($id)) {
    $row.Hinmoku = $fixByKanri[$id]
    $fixed++
    Write-Host ("  {0} {1} -> {2} {3}" -f $id, $row.Mise, $row.Hinmoku, (Get-ItemName $row.Hinmoku $row.Mise))
  }
}
Write-Host "fixed $fixed"
$details | Export-Csv -NoTypeInformation -Encoding UTF8 $detailsPath

$meisai = New-Object System.Collections.Generic.List[object]
$salesAgg = @{}
$outAgg = @{}
$itemQty = @{}
$storeItem = @{}
foreach ($row in $details) {
  $lot = Get-LotFromFile $row.File
  $null = $lot -match 'AYG(\d{3})'
  $year = Get-YearFromLotNum ([int]$Matches[1])
  $null = $row.Date -match '(\d{1,2})月(\d{1,2})日'
  $ym = '{0}年{1:D2}月' -f $year, ([int]$Matches[1])
  $code = [string]$row.Hinmoku
  $mise = [string]$row.Mise
  $name = Get-ItemName $code $mise
  $meisai.Add([pscustomobject]@{ Kanri=$row.Kanri; Code=$code; Name=$name })
  $sk = "$ym`t$mise`t$code"
  if (-not $salesAgg.ContainsKey($sk)) { $salesAgg[$sk] = @{ Qty=0; Name=$name } }
  $salesAgg[$sk].Qty++
  $salesAgg[$sk].Name = $name
  $ok = "$ym`t$code`t$name"
  if (-not $outAgg.ContainsKey($ok)) { $outAgg[$ok] = 0 }
  $outAgg[$ok]++
  $ik = "$code`t$name"
  if (-not $itemQty.ContainsKey($ik)) { $itemQty[$ik] = 0 }
  $itemQty[$ik]++
  $sik = "$mise`t$code"
  if (-not $storeItem.ContainsKey($sik)) { $storeItem[$sik] = @{ Qty=0; Name=$name } }
  $storeItem[$sik].Qty++
  $storeItem[$sik].Name = $name
}

$salesRows = $salesAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Mise=$p[1]; Hin=$p[2]; Name=$_.Value.Name; Qty=[int]$_.Value.Qty; Key="$($p[1])|$($p[2])" }
} | Sort-Object YM, Mise, Hin

$outRows = $outAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Hin=$p[1]; Name=$p[2]; Qty=[int]$_.Value }
} | Sort-Object YM, Hin, Name

$masterSales = $storeItem.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ Mise=$p[0]; Hin=$p[1]; Name=$_.Value.Name; Qty=[int]$_.Value.Qty; Key="$($p[0])|$($p[1])" }
} | Sort-Object Mise, Hin

Write-Host ("salesRows={0} outRows={1} storeItem={2} qty={3}" -f $salesRows.Count, $outRows.Count, $masterSales.Count, $meisai.Count)

$masterOut = New-Object System.Collections.Generic.List[object]
$masterOut.Add(@('FR','振袖', $null, [int]$itemQty['FR	振袖'], '店番号A700以外。価格案の振袖11,500'))
$masterOut.Add(@('FR','掛下', $null, [int]$itemQty['FR	掛下'], '店番号A700のみ。価格案の掛下16,000'))
foreach ($code in $nameMap.Keys) {
  $nm = [string]$nameMap[$code]
  $qty = 0
  $ik = "$code`t$nm"
  if ($itemQty.ContainsKey($ik)) { $qty = [int]$itemQty[$ik] }
  $note = ''
  if ($code -eq 'TO') { $note = '価格案は留袖比翼13,000／色留袖12,000。輸出品目は「留袖・色留袖」のため未設定' }
  elseif ($outsourcePriceByName.ContainsKey($nm)) { $note = '価格案1　勝矢和裁様（1対1対応）' }
  elseif ($nm -eq '浴衣') { $note = '価格案に浴衣なし' }
  elseif ($nm -eq '子供着物') { $note = '価格案に子供着物なし' }
  elseif ($nm -eq '子供襦袢') { $note = '価格案に子供襦袢なし' }
  elseif ($nm -eq '打掛（刺繍用）') { $note = '価格案に打掛（刺繍用）なし' }
  elseif ($nm -eq '留袖（刺繍用）') { $note = '価格案に留袖（刺繍用）なし' }
  elseif ($nm -eq '紳士浴衣') { $note = '価格案に紳士浴衣なし' }
  $masterOut.Add(@($code, $nm, $null, $qty, $note))
}
$moLast = 3 + $masterOut.Count

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.Calculation = -4135
  $wb = $excel.Workbooks.Open($xlsx)

  # preserve user-entered prices
  $savedSales = @{}
  $ms = $wb.Worksheets.Item('取引先加工単価マスタ')
  $oldMsLast = $ms.UsedRange.Rows.Count
  for ($r=4; $r -le $oldMsLast; $r++) {
    $k = [string]$ms.Cells.Item($r,5).Value2
    if (-not $k) { $k = ([string]$ms.Cells.Item($r,1).Value2) + '|' + ([string]$ms.Cells.Item($r,2).Value2) }
    $p = $ms.Cells.Item($r,4).Value2
    if ($null -ne $p -and $p -ne '') { $savedSales[$k] = $p }
  }
  Write-Host ("saved sales prices {0}" -f $savedSales.Count)

  $savedOut = @{}
  $mo = $wb.Worksheets.Item('外注加工単価マスタ')
  $oldMoLast = $mo.UsedRange.Rows.Count
  for ($r=4; $r -le $oldMoLast; $r++) {
    $k = [string]$mo.Cells.Item($r,6).Value2
    if (-not $k) { $k = ([string]$mo.Cells.Item($r,1).Value2) + '|' + ([string]$mo.Cells.Item($r,2).Value2) }
    $p = $mo.Cells.Item($r,3).Value2
    if ($null -ne $p -and $p -ne '') { $savedOut[$k] = $p }
  }
  Write-Host ("saved outsource prices {0}" -f $savedOut.Count)

  $st = $wb.Worksheets.Item('設定')
  $st.Cells.Item(12,1) = '品目訂正'
  $st.Cells.Item(12,2) = '06080293=羽織(HA), 06120039=喪服夏(MS), 08010174=紬(TM), 08020357=訪問着(HM), 08040510=コート(CO)'

  # 輸出明細データ 品目コード・品目名
  Write-Host 'Update 輸出明細データ'
  $me = $wb.Worksheets.Item('輸出明細データ')
  Write-Col $me 6 4 @($meisai | ForEach-Object { $_.Code })
  Write-Col $me 7 4 @($meisai | ForEach-Object { $_.Name })

  # 取引先マスタ rebuild, restore prices
  Write-Host 'Rewrite 取引先加工単価マスタ'
  $ms.Range('A3:F2000').Clear() | Out-Null
  $msData = New-Object System.Collections.Generic.List[object]
  foreach ($x in $masterSales) {
    $price = $null
    if ($savedSales.ContainsKey($x.Key)) { $price = $savedSales[$x.Key] }
    $msData.Add(@($x.Mise, $x.Hin, $x.Name, $price, $x.Key, [int]$x.Qty))
  }
  Write-Block $ms 3 1 @('店番号','品目コード','品目名','取引先加工単価','検索キー','実績枚数') $msData
  $msLast = 3 + $msData.Count
  $ms.Range("D4:D$msLast").NumberFormat = '#,##0'
  $ms.Range('A3:F3').AutoFilter() | Out-Null
  $ms.Columns.AutoFit() | Out-Null

  # 外注マスタ
  Write-Host 'Rewrite 外注加工単価マスタ'
  $mo.Range('A3:F80').Clear() | Out-Null
  $moKeys = New-Object System.Collections.Generic.List[object]
  foreach ($row in $masterOut) {
    $code = [string]$row[0]; $nm = [string]$row[1]
    $key = "$code|$nm"
    $price = $null
    if ($savedOut.ContainsKey($key)) { $price = $savedOut[$key] }
    elseif ($outsourcePriceByName.ContainsKey($nm)) { $price = [int]$outsourcePriceByName[$nm] }
    $moKeys.Add(@($code, $nm, $price, [int]$row[3], [string]$row[4], $key))
  }
  Write-Block $mo 3 1 @('品目コード','品目名','外注加工単価','実績枚数','備考','検索キー') $moKeys
  $mo.Range("C4:C$moLast").NumberFormat = '#,##0'
  $mo.Range('A3:F3').AutoFilter() | Out-Null
  $mo.Columns.AutoFit() | Out-Null
  $mo.Columns.Item(5).ColumnWidth = 70

  # 月別売上明細 rebuild
  Write-Host ("Rewrite 月別売上明細 {0}" -f $salesRows.Count)
  $sv = $wb.Worksheets.Item('月別売上明細')
  $sv.Range('A3:H4000').Clear() | Out-Null
  $svData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $salesRows) {
    $i++
    $r = 3 + $i
    $priceF = '=IFERROR(IF(INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(H' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))="","単価未登録",INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(H' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))),"単価未登録")'
    $amtF = '=IF(F' + $r + '="単価未登録","単価未登録",E' + $r + '*F' + $r + ')'
    $svData.Add(@($x.YM, $x.Mise, $x.Hin, $x.Name, [int]$x.Qty, $priceF, $amtF, $x.Key))
  }
  Write-Block $sv 3 1 @('年月','店番号','品目コード','品目名','枚数','取引先加工単価','仕立て売上','検索キー') $svData
  $svLast = 3 + $svData.Count
  Write-Col $sv 1 4 @($salesRows | ForEach-Object { $_.YM })
  Write-Col $sv 2 4 @($salesRows | ForEach-Object { $_.Mise })
  Write-Col $sv 3 4 @($salesRows | ForEach-Object { $_.Hin })
  Write-Col $sv 4 4 @($salesRows | ForEach-Object { $_.Name })
  $sv.Range("F4:G$svLast").NumberFormat = '#,##0'
  $sv.Range('A3:H3').AutoFilter() | Out-Null
  $sv.Columns.AutoFit() | Out-Null

  # 月別外注費明細
  Write-Host ("Rewrite 月別外注費明細 {0}" -f $outRows.Count)
  $ov = $wb.Worksheets.Item('月別外注費明細')
  $ov.Range('A3:G600').Clear() | Out-Null
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

  # 月別品目損益
  $ip = $wb.Worksheets.Item('月別品目損益')
  $ip.Range('A3:G600').Clear() | Out-Null
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

  # 損益 外注範囲
  $pl = $wb.Worksheets.Item('月別損益集計')
  for ($r=4; $r -le 28; $r++) {
    $pl.Cells.Item($r,2).Formula = '=SUMIF(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$E$4:$E$' + $svLast + ')'
    $pl.Cells.Item($r,7).Formula = '=SUMIFS(''月別売上明細''!$E$4:$E$' + $svLast + ',''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$F$4:$F$' + $svLast + ',"単価未登録")'
    $pl.Cells.Item($r,3).Formula = '=IF(G' + $r + '>0,"単価未登録",SUMIF(''月別売上明細''!$A$4:$A$' + $svLast + ',A' + $r + ',''月別売上明細''!$G$4:$G$' + $svLast + '))'
    $pl.Cells.Item($r,4).Formula = '=IF(H' + $r + '>0,"単価未登録",SUMIF(''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$F$4:$F$' + $ovLast + '))'
    $pl.Cells.Item($r,8).Formula = '=SUMIFS(''月別外注費明細''!$D$4:$D$' + $ovLast + ',''月別外注費明細''!$A$4:$A$' + $ovLast + ',A' + $r + ',''月別外注費明細''!$E$4:$E$' + $ovLast + ',"単価未登録")'
  }

  # 単価未登録一覧
  $un = $wb.Worksheets.Item('単価未登録一覧')
  $un.Range('A3:J2000').Clear() | Out-Null
  $unData = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($x in $masterSales) {
    $i++
    $r = 3 + $i
    $st = '=IFERROR(IF(INDEX(''取引先加工単価マスタ''!$D$4:$D$' + $msLast + ',MATCH(B' + $r + '&"|"&C' + $r + ',''取引先加工単価マスタ''!$E$4:$E$' + $msLast + ',0))="","単価未登録","登録済"),"単価未登録")'
    $unData.Add(@($st, $x.Mise, $x.Hin, $x.Name, [int]$x.Qty))
  }
  Write-Block $un 3 1 @('状態','店番号','品目コード','品目名','枚数') $unData
  Write-Col $un 2 4 @($masterSales | ForEach-Object { $_.Mise })
  Write-Col $un 3 4 @($masterSales | ForEach-Object { $_.Hin })
  Write-Col $un 4 4 @($masterSales | ForEach-Object { $_.Name })
  $un.Cells.Item(2,7) = '外注加工単価の未登録品目'
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

  $chk = $wb.Worksheets.Item('チェック')
  $chk.Cells.Item(5,2).Formula = "=COUNTA('輸出明細データ'!A4:A8882)"
  $chk.Cells.Item(6,2).Formula = "=SUM('月別売上明細'!E4:E$svLast)"
  $chk.Cells.Item(7,2).Formula = "=SUM('月別外注費明細'!D4:D$ovLast)"
  $chk.Cells.Item(8,2).Formula = "='月別損益集計'!B29"
  $chk.Cells.Item(9,2).Formula = "=SUM('月別品目損益'!D4:D$ipLast)"

  $excel.Calculation = -4105
  $excel.Calculate()

  for ($r=4; $r -le 9; $r++) {
    Write-Host ("CHK {0} | {1} | {2}" -f $chk.Cells.Item($r,1).Text, $chk.Cells.Item($r,2).Text, $chk.Cells.Item($r,3).Text)
  }
  Write-Host ("PL tot: " + ((1..8 | ForEach-Object { $pl.Cells.Item(29,$_).Text }) -join ' | '))

  $wb.Save()
  $wb.Close($true)
  Write-Host SAVED
} finally {
  if ($excel) { $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

try {
  Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費_FR区分.xlsx" -Force
  Write-Host 'copied Desktop FR区分'
} catch {
  Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費_品目訂正.xlsx" -Force
  Write-Host 'copied Desktop 品目訂正'
}
