param(
  [string]$BaseUrl = "http://localhost:3000"
)
Write-Host "Smoke testing backend at $BaseUrl"
try {
  $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
  Write-Host "Health OK:" ($health | ConvertTo-Json -Compress)
} catch {
  Write-Error "Health endpoint failed: $($_.Exception.Message)"
  exit 1
}
$payload = @{ url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } | ConvertTo-Json
try {
  $info = Invoke-RestMethod -Method Post -Uri "$BaseUrl/video-info" -ContentType "application/json" -Body $payload
  Write-Host "Video info OK. Title:" $info.title
} catch {
  Write-Error "video-info endpoint failed: $($_.Exception.Message)"
  exit 1
}
Write-Host "Smoke test passed."
