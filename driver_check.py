"""Checagem e instalacao do driver do leitor CH341A (so Windows).

O driver (drives/CH341WDM.INF) antes era instalado pelo instalador. Como o
programa agora e um .exe unico, ele mesmo confere se o driver esta no
Windows e, se nao estiver, oferece instalar (pede permissao de administrador).
"""

from __future__ import annotations

import os
import subprocess
import sys

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_INF_NAME = "ch341wdm.inf"


def ch341_driver_installed() -> bool | None:
    """True/False se da pra saber; None se a checagem nao funcionou
    (ai quem chama nao incomoda o usuario)."""
    if sys.platform != "win32":
        return None
    sysroot = os.environ.get("SystemRoot", r"C:\Windows")
    for sysfile in ("CH341W64.SYS", "CH341WDM.SYS"):
        if os.path.exists(os.path.join(sysroot, "System32", "drivers", sysfile)):
            return True
    try:
        out = subprocess.run(
            ["pnputil", "/enum-drivers"], capture_output=True, timeout=30,
            creationflags=_NO_WINDOW,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    text = out.decode("utf-8", errors="ignore") + out.decode("cp850", errors="ignore")
    return _INF_NAME in text.lower()


def install_ch341_driver(inf_path: str) -> bool:
    """Instala o driver no Windows pedindo administrador (janela do UAC).
    Bloqueia ate terminar -- chamar numa thread. Retorna True se, depois,
    o driver aparece como instalado."""
    args = f"'/add-driver','{inf_path}','/install'"
    cmd = (f"Start-Process pnputil -ArgumentList {args} -Verb RunAs "
           "-Wait -WindowStyle Hidden")
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                       timeout=180, creationflags=_NO_WINDOW)
    except (OSError, subprocess.SubprocessError):
        return False
    return ch341_driver_installed() is True
