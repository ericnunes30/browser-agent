#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnostica e corrige o erro HTTP 403 do Ollama para a extensão BrowserAgent.
.DESCRIPTION
  Verifica se o Ollama está rodando, reproduz o erro 403 com origem de chrome-extension,
  confirma que POST sem Origin funciona, e reinicia o Ollama com OLLAMA_ORIGINS=chrome-extension://*.
.NOTES
  Rode como Administrador se quiser persistir a variável de ambiente permanentemente.
#>

param(
  [switch]$Persist
)

$OLLAMA_URL = "http://localhost:11434"
$TEST_BODY = '{"model":"llama3.2","messages":[{"role":"user","content":"oi"}],"stream":false}'

function Write-Header($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Test-OllamaRunning {
  Write-Header "1. Verificando se Ollama responde"
  try {
    $res = Invoke-WebRequest -Uri $OLLAMA_URL -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ Ollama está rodando: $($res.Content)" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "❌ Ollama não responde em $OLLAMA_URL" -ForegroundColor Red
    Write-Host "   Inicie o Ollama primeiro e rode este script novamente." -ForegroundColor Yellow
    return $false
  }
}

function Test-WithChromeExtensionOrigin {
  Write-Header "2. Testando POST /api/chat com Origin de Chrome Extension"
  try {
    $res = Invoke-WebRequest -Uri "$OLLAMA_URL/api/chat" `
      -Method POST `
      -Headers @{ "Origin" = "chrome-extension://fake123" } `
      -Body $TEST_BODY `
      -ContentType "application/json" `
      -UseBasicParsing -TimeoutSec 15
    Write-Host "✅ Funcionou (status $($res.StatusCode)) — CORS já está configurado." -ForegroundColor Green
    return $true
  } catch {
    $status = $_.Exception.Response?.StatusCode.value__
    if ($status -eq 403) {
      Write-Host "❌ HTTP 403 confirmado — Ollama está rejeitando origem de chrome-extension." -ForegroundColor Red
      return $false
    }
    Write-Host "❌ Outro erro: $($_)" -ForegroundColor Red
    return $false
  }
}

function Test-WithoutOrigin {
  Write-Header "3. Testando POST /api/chat sem Origin"
  try {
    $res = Invoke-WebRequest -Uri "$OLLAMA_URL/api/chat" `
      -Method POST `
      -Body $TEST_BODY `
      -ContentType "application/json" `
      -UseBasicParsing -TimeoutSec 15
    Write-Host "✅ Funcionou sem Origin — Ollama está saudável, só precisa permitir a origem." -ForegroundColor Green
    return $true
  } catch {
    Write-Host "❌ Falhou mesmo sem Origin: $($_)" -ForegroundColor Red
    return $false
  }
}

function Stop-OllamaProcess {
  Write-Header "4. Parando processo do Ollama"
  $proc = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Processo ollama.exe parado." -ForegroundColor Green
  } else {
    Write-Host "ℹ️ Nenhum processo ollama.exe encontrado." -ForegroundColor Yellow
  }
}

function Start-OllamaWithCors {
  Write-Header "5. Iniciando Ollama com OLLAMA_ORIGINS=chrome-extension://*"
  $env:OLLAMA_ORIGINS = "chrome-extension://*"

  if ($Persist) {
    try {
      [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
      Write-Host "✅ Variável de ambiente OLLAMA_ORIGINS persistida para o usuário." -ForegroundColor Green
    } catch {
      Write-Host "⚠️ Não foi possível persistir a variável. Execute como Administrador para persistir." -ForegroundColor Yellow
    }
  } else {
    Write-Host "ℹ️ Modo não-persistente. Reinicie o Ollama manualmente ou use -Persist." -ForegroundColor Yellow
  }

  try {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Normal
    Write-Host "✅ Ollama reiniciado. Aguarde alguns segundos e teste a extensão." -ForegroundColor Green
  } catch {
    Write-Host "❌ Falha ao iniciar ollama serve: $($_)" -ForegroundColor Red
  }
}

# --- main ---
Write-Host "BrowserAgent Ollama CORS Diagnostic" -ForegroundColor Cyan
Write-Host "URL do Ollama: $OLLAMA_URL" -ForegroundColor Gray

if (-not (Test-OllamaRunning)) { exit 1 }

$corsProblem = -not (Test-WithChromeExtensionOrigin)
$withoutOriginOk = Test-WithoutOrigin

if ($corsProblem -and $withoutOriginOk) {
  Write-Host "`n🔍 Diagnóstico: Ollama está saudável, mas rejeita origens chrome-extension." -ForegroundColor Yellow
  Write-Host "   Solução: reiniciar o Ollama com OLLAMA_ORIGINS=chrome-extension://*" -ForegroundColor Yellow

  $confirm = Read-Host "`nDeseja reiniciar o Ollama agora com a origem correta? (s/n)"
  if ($confirm -eq 's' -or $confirm -eq 'S') {
    Stop-OllamaProcess
    Start-OllamaWithCors
  } else {
    Write-Host "`nPara corrigir manualmente, rode em um terminal:" -ForegroundColor Cyan
    Write-Host "  set OLLAMA_ORIGINS=chrome-extension://* && ollama serve" -ForegroundColor White
  }
} elseif (-not $corsProblem) {
  Write-Host "`n✅ CORS já está configurado corretamente." -ForegroundColor Green
  Write-Host "   Se a extensão ainda der 403, verifique o URL, modelo e provider ativo." -ForegroundColor Gray
} else {
  Write-Host "`n❌ Ollama não está respondendo corretamente nem sem Origin." -ForegroundColor Red
  Write-Host "   Verifique se o modelo 'llama3.2' existe ou se há outro erro no Ollama." -ForegroundColor Yellow
}
