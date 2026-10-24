<#
Identical cloud machines standing in for volunteers, for a controlled scaling
test: each VM runs exactly the helper a volunteer pastes (see
cloud-volunteer-startup.sh) and shows up as a computer on your account.

  powershell -ExecutionPolicy Bypass -File tools\cloud-volunteers.ps1 up -Count 8
  powershell -ExecutionPolicy Bypass -File tools\cloud-volunteers.ps1 online -Count 2
  powershell -ExecutionPolicy Bypass -File tools\cloud-volunteers.ps1 status
  powershell -ExecutionPolicy Bypass -File tools\cloud-volunteers.ps1 down

up      creates the machines and registers each one with a fresh setup code
online  keeps the first N machines running and stops the rest
status  lists the machines and which computers the site sees online
down    deletes every machine this script made (stops all charges)
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet("up", "online", "status", "down")][string]$Action,
  [int]$Count = 8,
  [string]$MachineType = "e2-standard-4",
  [string]$Project = "decompute-508417"
)

$ErrorActionPreference = "Stop"
$Api = "https://decompute-backend-vzvz5uszaa-uc.a.run.app"
$ApiHost = "decompute-backend-vzvz5uszaa-uc.a.run.app"
$Label = "purpose=decompute-volunteer"
# Spread over regions: CPU quota is per region, and a new project often
# allows only 24 per region.
$Zones = @("us-central1-a", "us-east1-b", "us-west1-b", "us-east4-a", "us-central1-b", "us-east1-c", "us-west1-a", "us-east4-b")
$StartupScript = Join-Path $PSScriptRoot "cloud-volunteer-startup.sh"

function Get-Machines {
  # Plain "name zone status" lines: Windows PowerShell 5.1's ConvertFrom-Json
  # hands back a JSON array as one object, which broke reading zones.
  $lines = gcloud compute instances list --project $Project --filter "labels.purpose=decompute-volunteer" --format "value(name,zone.basename(),status)"
  if ($LASTEXITCODE -ne 0) { return @() }
  $list = foreach ($line in @($lines)) {
    $parts = ([string]$line).Trim() -split "\s+"
    if ($parts.Count -ge 3) { [pscustomobject]@{ name = $parts[0]; zone = $parts[1]; status = $parts[2] } }
  }
  return @($list | Sort-Object name)
}

function Show-Online {
  $nodes = (Invoke-RestMethod "$Api/api/nodes?limit=200").data | Where-Object { $_.status -ne "offline" }
  Write-Host ""
  Write-Host "Online on the site: $(@($nodes).Count)"
  foreach ($n in $nodes) { Write-Host ("  {0}  {1}  {2} cores  {3}" -f $n.name, $n.status, $n.cpu_cores, $n.cpu_model) }
}

if ($Action -eq "up") {
  Write-Host "Enabling Compute Engine (first time takes a minute)..."
  gcloud services enable compute.googleapis.com --project $Project
  if ($LASTEXITCODE -ne 0) { throw "Couldn't enable Compute Engine" }

  # Codes are made under your account, so the machines appear on your
  # Contribute page. The password is only sent to Decompute's own login.
  $email = Read-Host "Decompute email"
  $secure = Read-Host "Decompute password" -AsSecureString
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $token = (Invoke-RestMethod -Method Post "$Api/api/auth/login-email" -ContentType "application/json" `
    -Body (@{ email = $email; password = $password } | ConvertTo-Json)).token
  $auth = @{ Authorization = "Bearer $token" }

  $created = @()
  for ($i = 1; $i -le $Count; $i++) {
    $name = "decompute-vol-{0:D2}" -f $i
    $zone = $Zones[($i - 1) % $Zones.Count]
    Write-Host "Creating $name in $zone..."
    gcloud compute instances create $name --project $Project --zone $zone --machine-type $MachineType `
      --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 20GB `
      --labels $Label --no-service-account --no-scopes `
      --metadata-from-file "startup-script=$StartupScript" --quiet
    if ($LASTEXITCODE -eq 0) { $created += [pscustomobject]@{ name = $name; zone = $zone } }
    else { Write-Host "  Couldn't create $name (often the CPU quota). Continuing with the rest." -ForegroundColor Yellow }
  }
  if ($created.Count -eq 0) { throw "No machines were created" }

  # One code at a time: each new code cancels the previous unused one.
  foreach ($m in $created) {
    $code = (Invoke-RestMethod -Method Post "$Api/api/nodes/pairing-codes" -Headers $auth).data.code
    gcloud compute instances add-metadata $m.name --project $Project --zone $m.zone --metadata "decompute-setup=$code@$ApiHost" | Out-Null
    Write-Host "Waiting for $($m.name) to register (the first can take ~4 min: it installs Docker and downloads images)..."
    $deadline = (Get-Date).AddMinutes(12)
    do {
      Start-Sleep -Seconds 10
      $status = (Invoke-RestMethod "$Api/api/nodes/pairing-codes/$code" -Headers $auth).data.status
    } until ($status -eq "claimed" -or (Get-Date) -gt $deadline)
    if ($status -eq "claimed") { Write-Host "  $($m.name) registered" -ForegroundColor Green }
    else { Write-Host "  $($m.name) didn't register in time; check it with: gcloud compute ssh $($m.name) --zone $($m.zone) --project $Project" -ForegroundColor Yellow }
  }
  Show-Online
}
elseif ($Action -eq "online") {
  $machines = Get-Machines
  for ($i = 0; $i -lt $machines.Count; $i++) {
    $m = $machines[$i]
    if ($i -lt $Count -and $m.status -ne "RUNNING") {
      Write-Host "Starting $($m.name)"; gcloud compute instances start $m.name --project $Project --zone $m.zone --async --quiet | Out-Null
    }
    elseif ($i -ge $Count -and $m.status -eq "RUNNING") {
      Write-Host "Stopping $($m.name)"; gcloud compute instances stop $m.name --project $Project --zone $m.zone --async --quiet | Out-Null
    }
  }
  Write-Host "Give it ~2 minutes, then run 'status': exactly $Count cloud computers should be online before you start a screen."
}
elseif ($Action -eq "status") {
  $machines = Get-Machines
  Write-Host "Cloud machines: $($machines.Count)"
  foreach ($m in $machines) { Write-Host ("  {0}  {1}  {2}" -f $m.name, $m.zone, $m.status) }
  Show-Online
}
elseif ($Action -eq "down") {
  # instances delete has no --async, so it's one blocking call per zone.
  $machines = Get-Machines
  foreach ($group in ($machines | Group-Object zone)) {
    $names = @($group.Group | ForEach-Object { $_.name })
    Write-Host "Deleting $($names -join ', ') in $($group.Name)..."
    gcloud compute instances delete @names --project $Project --zone $group.Name --quiet
  }
  $left = @(Get-Machines).Count
  if ($left -eq 0) { Write-Host "All cloud machines deleted; charges have stopped. Remove their entries with the Remove button on your Contribute page." -ForegroundColor Green }
  else { Write-Host "$left machine(s) still exist. Run 'down' again, or delete them in the Cloud Console under Compute Engine > VM instances." -ForegroundColor Yellow }
}
