$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$detailsPath = "C:\CAYANAS_Print_v2\_tmp_export_82_147\_parsed\details.csv"
$xlsx = "C:\Users\user\Downloads\輸出明細82-147_月別仕立て売上と外注加工費.xlsx"

$nameMap = [ordered]@{
  TO='留袖・色留袖'; FR='振袖・掛下'; HM='訪問着'; TK='附下'; MW='喪服　冬'; MS='喪服　夏'
  KM='小紋'; IR='色無地'; TM='紬'; CO='コート'; HA='羽織'; NA='長襦袢'; NF='長襦袢.振袖'
  YK='浴衣'; MK='紳士着物'; MH='紳士羽織'; MY='紳士浴衣'; '2K'='二部式着物'; '2J'='二部式襦袢'
  CK='子供着物'; CJ='子供襦袢'; UC='打掛・白無垢'; UE='打掛（刺繍用）'; TE='留袖（刺繍用）'
  C0='コート（C0）'; CH='CH（不明）'; WS='WS（不明）'; TN='TN（不明）'; HN='HN（不明）'
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

$details = @(Import-Csv -LiteralPath $detailsPath)
$salesAgg = @{}
$outAgg = @{}
foreach ($row in $details) {
  $lot = Get-LotFromFile $row.File
  $null = $lot -match 'AYG(\d{3})'
  $year = Get-YearFromLotNum ([int]$Matches[1])
  $null = $row.Date -match '(\d{1,2})月(\d{1,2})日'
  $month = [int]$Matches[1]
  $ym = '{0}年{1:D2}月' -f $year, $month
  $code = [string]$row.Hinmoku
  $mise = [string]$row.Mise
  $k = "$ym`t$mise`t$code"
  if (-not $salesAgg.ContainsKey($k)) { $salesAgg[$k] = 0 }
  $salesAgg[$k]++
  $k2 = "$ym`t$code"
  if (-not $outAgg.ContainsKey($k2)) { $outAgg[$k2] = 0 }
  $outAgg[$k2]++
}

$salesRows = $salesAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Mise=$p[1]; Hin=$p[2]; Qty=[int]$_.Value }
} | Sort-Object YM, Mise, Hin

$outRows = $outAgg.GetEnumerator() | ForEach-Object {
  $p = $_.Key.Split("`t")
  [pscustomobject]@{ YM=$p[0]; Hin=$p[1]; Qty=[int]$_.Value }
} | Sort-Object YM, Hin

$ymList = @($salesRows.YM | Select-Object -Unique | Sort-Object)

$itemCodes = @()
foreach ($k in $nameMap.Keys) { $itemCodes += [string]$k }
foreach ($k in @($details | Select-Object -ExpandProperty Hinmoku -Unique)) {
  if ($itemCodes -notcontains $k) { $itemCodes += [string]$k }
}

function Write-Col($ws, $col, $startRow, [string[]]$values) {
  $n = $values.Count
  $arr = New-Object 'object[,]' $n, 1
  for ($i=0; $i -lt $n; $i++) { $arr[$i,0] = $values[$i] }
  $ws.Range($ws.Cells.Item($startRow,$col), $ws.Cells.Item($startRow+$n-1,$col)).NumberFormat = '@'
  $ws.Range($ws.Cells.Item($startRow,$col), $ws.Cells.Item($startRow+$n-1,$col)).Value2 = $arr
}

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.Calculation = -4135
  $wb = $excel.Workbooks.Open($xlsx)

  $mo = $wb.Worksheets.Item('外注加工単価マスタ')
  Write-Host "Fix 外注コード $($itemCodes.Count)"
  Write-Col $mo 1 4 $itemCodes

  $sv = $wb.Worksheets.Item('月別売上明細')
  Write-Host "Fix 売上年月 $($salesRows.Count)"
  Write-Col $sv 1 4 @($salesRows | ForEach-Object { $_.YM })
  Write-Col $sv 2 4 @($salesRows | ForEach-Object { $_.Mise })
  Write-Col $sv 3 4 @($salesRows | ForEach-Object { $_.Hin })

  $ov = $wb.Worksheets.Item('月別外注費明細')
  Write-Host "Fix 外注年月 $($outRows.Count)"
  Write-Col $ov 1 4 @($outRows | ForEach-Object { $_.YM })
  Write-Col $ov 2 4 @($outRows | ForEach-Object { $_.Hin })

  $pl = $wb.Worksheets.Item('月別損益集計')
  Write-Host "Fix 損益年月 $($ymList.Count)"
  Write-Col $pl 1 4 $ymList

  $ip = $wb.Worksheets.Item('月別品目損益')
  Write-Col $ip 1 4 @($outRows | ForEach-Object { $_.YM })
  Write-Col $ip 2 4 @($outRows | ForEach-Object { $_.Hin })

  $un = $wb.Worksheets.Item('単価未登録一覧')
  Write-Col $un 8 4 $itemCodes

  $me = $wb.Worksheets.Item('輸出明細データ')
  $me.Range('D4:D8882').NumberFormat = '@'

  $excel.Calculation = -4105
  $excel.Calculate()

  $chk = $wb.Worksheets.Item('チェック')
  for ($r=4; $r -le 9; $r++) {
    Write-Host ("CHK {0} | {1} | {2}" -f $chk.Cells.Item($r,1).Text, $chk.Cells.Item($r,2).Text, $chk.Cells.Item($r,3).Text)
  }
  Write-Host ("PL R4: " + ((1..8 | ForEach-Object { $pl.Cells.Item(4,$_).Text }) -join " | "))
  Write-Host ("OV R5: " + ((1..6 | ForEach-Object { $ov.Cells.Item(5,$_).Text }) -join " | "))
  Write-Host ("MO R6: " + ((1..5 | ForEach-Object { $mo.Cells.Item(6,$_).Text }) -join " | "))
  Write-Host ("PL tot: " + ((1..8 | ForEach-Object { $pl.Cells.Item(29,$_).Text }) -join " | "))

  $wb.Save()
  $wb.Close($true)
} finally {
  if ($excel) { $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

Copy-Item -LiteralPath $xlsx -Destination "C:\Users\user\Desktop\輸出明細82-147_月別仕立て売上と外注加工費.xlsx" -Force
Write-Host DONE
