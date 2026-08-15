' ============================================================================
'  Inicia o Vekta Ai SEM mostrar a janela preta do console (cmd).
'  Chama iniciar-vekta.bat com a janela oculta; o app Electron abre normalmente
'  (janela GUI propria). O atalho "Iniciar.lnk" na raiz aponta para este arquivo.
' ============================================================================
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 2o arg = 0 (janela oculta) ; 3o arg = False (nao espera terminar)
sh.Run """" & dir & "\iniciar-vekta.bat""", 0, False
