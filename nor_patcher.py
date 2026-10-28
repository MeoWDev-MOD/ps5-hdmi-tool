"""
Aplicacao do patch de conversao de chip HDMI (Realtek <-> Nuvoton/Panasonic).

O arquivo da conversao e o PROPRIO arquivo lido do console (todos os dados do
cliente -- serie, MAC, SKU, regiao, firmware -- ficam como estao). Dois
alvos de saida pro chip Nuvoton/Panasonic, iguais aos gerados pelo
"Conversor HDMI PS5" (comparado byte a byte em 2026-10-28, ver NOTES.md):

- TARGET_NUVOTON: so o seletor do chip (0x1C4062) e o checksum.
- TARGET_PANASONIC: seletor do chip + zera o bloco de pareamento
  (0x1C40C6) + zera a flag (0x1C4923) + contador de gravacao +1
  (0x1C49BE) + checksum.

O checksum em 0x1C41FE-0x1C41FF e calculado (ver compute_checksum): a soma
das palavras de 16 bits (little-endian) de 0x1C4000 a 0x1C41FF, incluindo o
proprio checksum, fecha em zero. Vale pra qualquer REV de Wi-Fi -- a antiga
tabela de valores fixos nao e mais necessaria.
"""

from __future__ import annotations

from dataclasses import dataclass

from i18n import t
from nor_parser import (
    OFFSET_CHIP_SELECT,
    OFFSET_MAC,
    MAC_LEN,
    OFFSET_WIFI_MAC,
    WIFI_MAC_LEN,
    OFFSET_SKU,
    SKU_LEN,
    OFFSET_FW_CURRENT,
    FW_LEN,
    OFFSET_MOBO_SERIAL,
    MOBO_SERIAL_LEN,
    OFFSET_BOARD_SERIAL,
    BOARD_SERIAL_LEN,
    CHIP_REALTEK,
    CHIP_NUVOTON_PANASONIC,
    OFFSET_CONSOLE_TYPE,
    CONSOLE_TYPE_LEN,
    CONSOLE_TYPE_SLIM,
    CONSOLE_TYPE_DISK,
    CONSOLE_TYPE_DIGITAL,
)

OFFSET_ZERO_BLOCK_1 = 0x1C40C6
ZERO_BLOCK_1_LEN = 20  # ate 0x1C40D9 inclusive

OFFSET_ZERO_BYTE = 0x1C4923

OFFSET_COUNTER = 0x1C49BE  # 2 bytes, big-endian, incrementa +1 a cada conversao

OFFSET_CHECKSUM = 0x1C41FE  # 2 bytes, little-endian, ver compute_checksum
OFFSET_CHECKSUM_BLOCK = 0x1C4000  # inicio do bloco coberto pelo checksum (ate 0x1C41FF)

TARGET_REALTEK = "realtek"
TARGET_NUVOTON = "nuvoton"
TARGET_PANASONIC = "panasonic"

TARGET_BYTE = {
    TARGET_REALTEK: CHIP_REALTEK,
    TARGET_NUVOTON: CHIP_NUVOTON_PANASONIC,
    TARGET_PANASONIC: CHIP_NUVOTON_PANASONIC,
}
TARGET_LABEL = {
    TARGET_REALTEK: "Realtek RTD2175P",
    TARGET_NUVOTON: "Nuvoton MN864739",
    TARGET_PANASONIC: "Panasonic MN864739",
}

# Alvos que tambem zeram o bloco de pareamento/flag e incrementam o contador.
# O alvo Nuvoton muda so o seletor do chip e o checksum.
_FULL_PATCH_TARGETS = (TARGET_REALTEK, TARGET_PANASONIC)


@dataclass
class PatchChange:
    offset: int
    old: bytes
    new: bytes
    description: str


@dataclass
class PatchResult:
    data: bytes
    changes: list[PatchChange]
    checksum_left_stale: bool


def compute_checksum(buf: bytes | bytearray) -> bytes:
    """Checksum de 2 bytes (little-endian) de 0x1C41FE: o valor que faz a soma
    das palavras de 16 bits (little-endian) de 0x1C4000-0x1C41FF fechar em
    zero (mod 65536). Confere em todas as NORs reais que temos (15 arquivos)."""
    total = 0
    for i in range(OFFSET_CHECKSUM_BLOCK, OFFSET_CHECKSUM, 2):
        total += buf[i] | (buf[i + 1] << 8)
    value = (-total) & 0xFFFF
    return bytes([value & 0xFF, value >> 8])


def apply_patch(original: bytes, target: str) -> PatchResult:
    if target not in TARGET_BYTE:
        raise ValueError(f"Alvo invalido: {target!r} (use {list(TARGET_BYTE)})")

    buf = bytearray(original)
    changes: list[PatchChange] = []
    full = target in _FULL_PATCH_TARGETS

    # 1. Seletor do chip HDMI
    old = bytes([buf[OFFSET_CHIP_SELECT]])
    new_val = TARGET_BYTE[target]
    buf[OFFSET_CHIP_SELECT] = new_val
    changes.append(PatchChange(
        OFFSET_CHIP_SELECT, old, bytes([new_val]),
        t("backend.patch.chip_selector", target=TARGET_LABEL[target])
    ))

    if full:
        # 2. Zerar bloco de 20 bytes
        old = bytes(buf[OFFSET_ZERO_BLOCK_1:OFFSET_ZERO_BLOCK_1 + ZERO_BLOCK_1_LEN])
        for i in range(ZERO_BLOCK_1_LEN):
            buf[OFFSET_ZERO_BLOCK_1 + i] = 0xFF
        changes.append(PatchChange(
            OFFSET_ZERO_BLOCK_1, old, b"\xFF" * ZERO_BLOCK_1_LEN,
            t("backend.patch.zero_block")
        ))

        # 3. Zerar byte isolado
        old = bytes([buf[OFFSET_ZERO_BYTE]])
        buf[OFFSET_ZERO_BYTE] = 0xFF
        changes.append(PatchChange(
            OFFSET_ZERO_BYTE, old, b"\xFF",
            t("backend.patch.zero_flag")
        ))

        # 4. Incrementar contador de 2 bytes (big-endian), com carry
        old_counter = bytes(buf[OFFSET_COUNTER:OFFSET_COUNTER + 2])
        val = (old_counter[0] << 8) | old_counter[1]
        val = (val + 1) & 0xFFFF
        new_counter = bytes([(val >> 8) & 0xFF, val & 0xFF])
        buf[OFFSET_COUNTER] = new_counter[0]
        buf[OFFSET_COUNTER + 1] = new_counter[1]
        changes.append(PatchChange(
            OFFSET_COUNTER, old_counter, new_counter,
            t("backend.patch.counter")
        ))

    # 5. Checksum recalculado sobre o bloco ja alterado (sempre por ultimo).
    old_checksum = bytes(buf[OFFSET_CHECKSUM:OFFSET_CHECKSUM + 2])
    new_checksum = compute_checksum(buf)
    buf[OFFSET_CHECKSUM:OFFSET_CHECKSUM + 2] = new_checksum
    changes.append(PatchChange(
        OFFSET_CHECKSUM, old_checksum, new_checksum,
        t("backend.patch.checksum_computed")
    ))

    return PatchResult(data=bytes(buf), changes=changes, checksum_left_stale=False)


def apply_donor_identity(donor: bytes, customer: bytes) -> PatchResult:
    """Grava os dados de identidade do cliente (numeros de serie + MAC/MAC
    Wi-Fi) por cima de um arquivo-base (NOR completa de outro console, ja
    com o chip HDMI alvo e todos os outros campos corretos pra aquela
    familia de placa -- ex. EDM-040-J100-PANASONIC.BIN).

    O arquivo-base ja precisa ser uma NOR valida e completa pro chip e
    familia de placa certos -- esta funcao NAO confere isso, so transplanta
    os campos de identidade. Confira o chip/familia detectados no
    arquivo-base (parse_nor) antes de gravar numa placa de cliente.

    REGRA (definida apos relato de "3 bips" com NOR gerada por patch direto):
    do console do usuario so sao reaproveitados o numero de serie do
    console, o SKU (que ja inclui o codigo de regiao) e o firmware atual
    (NVS). TODO o resto -- inclusive MAC, MAC Wi-Fi, identificador da
    placa-mae e tipo de console -- vem do arquivo-base, sem alteracao.

    Se o campo correspondente no console lido estiver em branco (0xFF --
    NOR corrompida/leitura falhou, ver nor_parser.is_blank()), NAO
    sobrescreve: mantem o valor que ja veio no arquivo-base, em vez de
    gravar lixo por cima de um dado bom. Isso permite "regenerar" uma NOR
    corrompida/em branco usando so o arquivo-base, mesmo sem nenhum dado
    de identidade aproveitavel do console original.
    """
    buf = bytearray(donor)
    changes: list[PatchChange] = []

    fields = [
        (OFFSET_BOARD_SERIAL, BOARD_SERIAL_LEN,
         t("backend.patch.donor_board_serial"), t("backend.patch.donor_board_serial_kept")),
        # SKU/modelo ja inclui o codigo de regiao (0x1C7236, 2 digitos).
        (OFFSET_SKU, SKU_LEN,
         t("backend.patch.donor_sku"), t("backend.patch.donor_sku_kept")),
        (OFFSET_FW_CURRENT, FW_LEN,
         t("backend.patch.donor_fw"), t("backend.patch.donor_fw_kept")),
    ]
    for offset, length, description, kept_description in fields:
        old = bytes(buf[offset:offset + length])
        new = customer[offset:offset + length]
        if new.count(0xFF) == length:
            changes.append(PatchChange(offset, old, old, kept_description))
            continue
        buf[offset:offset + length] = new
        changes.append(PatchChange(offset, old, bytes(new), description))

    return PatchResult(data=bytes(buf), changes=changes, checksum_left_stale=False)


CONSOLE_TYPE_SLIM_TARGET = "slim"
CONSOLE_TYPE_DISK_TARGET = "disk"
CONSOLE_TYPE_DIGITAL_TARGET = "digital"

CONSOLE_TYPE_TARGET_BYTES = {
    CONSOLE_TYPE_SLIM_TARGET: CONSOLE_TYPE_SLIM,
    CONSOLE_TYPE_DISK_TARGET: CONSOLE_TYPE_DISK,
    CONSOLE_TYPE_DIGITAL_TARGET: CONSOLE_TYPE_DIGITAL,
}
CONSOLE_TYPE_TARGET_KEY = {
    CONSOLE_TYPE_SLIM_TARGET: "backend.parser.console_type_slim",
    CONSOLE_TYPE_DISK_TARGET: "backend.parser.console_type_disk",
    CONSOLE_TYPE_DIGITAL_TARGET: "backend.parser.console_type_digital",
}


def apply_console_type(original: bytes, target: str) -> PatchResult:
    """Grava o campo "Tipo de console" (Disco/Digital/Slim Edition), 4 bytes
    em 0x1C7010 -- mesmo campo que o Console Service Tool le e grava (ver
    NOTES.md pra origem/validacao do offset). E so esse campo: nao depende
    de nenhum checksum, ao contrario do patch de chip HDMI.
    """
    if target not in CONSOLE_TYPE_TARGET_BYTES:
        raise ValueError(f"Alvo invalido: {target!r} (use {list(CONSOLE_TYPE_TARGET_BYTES)})")

    buf = bytearray(original)
    old = bytes(buf[OFFSET_CONSOLE_TYPE:OFFSET_CONSOLE_TYPE + CONSOLE_TYPE_LEN])
    new = CONSOLE_TYPE_TARGET_BYTES[target]
    buf[OFFSET_CONSOLE_TYPE:OFFSET_CONSOLE_TYPE + CONSOLE_TYPE_LEN] = new
    change = PatchChange(
        OFFSET_CONSOLE_TYPE, old, new,
        t("backend.patch.console_type", target=t(CONSOLE_TYPE_TARGET_KEY[target]))
    )
    return PatchResult(data=bytes(buf), changes=[change], checksum_left_stale=False)
