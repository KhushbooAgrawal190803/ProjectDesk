Set-Location 'c:\Users\khush\ProjectDesk\level-up-buildcon'

$vars = @(
  @('NEXT_PUBLIC_SUPABASE_URL', 'https://gaggdmgvmajzytdmrsxf.supabase.co'),
  @('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhZ2dkbWd2bWFqenl0ZG1yc3hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg0NDgsImV4cCI6MjA4NTg0NDQ0OH0.wX_OCekCL7GMW_vYdsAllY8BGkPPFY5WkYYE3UQ5q9U'),
  @('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhZ2dkbWd2bWFqenl0ZG1yc3hmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI2ODQ0OCwiZXhwIjoyMDg1ODQ0NDQ4fQ.N1VQ3a9s_ftbsKQ4tXymef2ELrql77CSZWch98xDSHY'),
  @('NEXT_PUBLIC_APP_URL', 'https://level-up-buildcon.vercel.app'),
  @('BOOTSTRAP_ADMIN_EMAILS', 'agkhushboo43@gmail.com'),
  @('NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAILS', 'agkhushboo43@gmail.com')
)

foreach ($v in $vars) {
  $name = $v[0]
  $value = $v[1]
  foreach ($env in @('production','preview','development')) {
    Write-Host "Setting $name for $env..."
    $value | vercel env add $name $env --force 2>&1 | Select-Object -Last 1
  }
}

Write-Host "All done!"
